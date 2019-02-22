"use strict";
const debugLib = require("debug");
const info = debugLib("abc4:info");
const debug = debugLib("abc4:aws");
const uuidv1 = require("uuid/v1");
const Base64 = require("js-base64").Base64;
const AWS = require("aws-sdk");
AWS.config.update({ logger: { log: debug } });
const { getAMIQueryFilter, getUserName } = require("./osDependent");
const { enableSshHostBasedAuthentication, keyScan, installAnsible, runPlaybooks } = require("../../common/setupScripts");
const { getPlaybook, getPlaybookNames } = require("../../common/playbook");

//private functions
/*eslint-disable valid-jsdoc require-jsdoc*/
function setLogger(opt) {
  if (typeof opt.debug === "function") {
    if (!debug.enabled) {
      const namespace = debugLib.disable();
      debugLib.enable(`abc4:aws,${namespace}`);
    }
    debug.log = opt.debug;

    //if only debug method is given, info is redirected to it
    if (typeof opt.info !== "function") {
      if (!info.enabled) {
        const namespace = debugLib.disable();
        debugLib.enable(`abc4:info,${namespace}`);
      }
      info.log = opt.debug;
    }
  }
  if (typeof opt.info === "function") {
    if (!info.enabled) {
      const namespace = debugLib.disable();
      debugLib.enable(`abc4:info,${namespace}`);
    }
    info.log = opt.info;
  }
}

async function setupKeyPair(ec2, KeyName, PublicKeyMaterial) {
  if (PublicKeyMaterial) {
    info("import public key");
    await ec2.importKeyPair({ KeyName, PublicKeyMaterial }).promise();
    return Promise.resolve();
  }
  info("create key pair");
  const keyPair = await ec2.createKeyPair({ KeyName }).promise();
  return keyPair.KeyMaterial;
}

async function setupIAMRole(iam, RoleName) {
  info("create IAM role");
  const AssumeRolePolicyDocument = JSON.stringify({
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Principal: { Service: "ec2.amazonaws.com" },
      Action: "sts:AssumeRole"
    }
  });

  await iam.createRole({ RoleName, AssumeRolePolicyDocument }).promise();
  await iam.attachRolePolicy({ RoleName, PolicyArn: "arn:aws:iam::aws:policy/AmazonEC2FullAccess" }).promise();
  const InstanceProfileName = RoleName;
  const rt = await iam.createInstanceProfile({ InstanceProfileName }).promise();
  await iam.addRoleToInstanceProfile({ InstanceProfileName, RoleName }).promise();
  info("create IAM role done");
  return rt.Arn;
}

async function creanUp(region, accessKeyId, secretAccessKey, KeyName, InstanceProfileName, RoleName) {
  const p = [];
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);
  info("remove keyPair");
  p.push(ec2.deleteKeyPair({ KeyName }).promise());
  info("remove IAM role");
  const iam = createIAMObject(region, accessKeyId, secretAccessKey);
  await iam.removeRoleFromInstanceProfile({ InstanceProfileName, RoleName }).promise();
  await iam.deleteInstanceProfile({ InstanceProfileName }).promise();
  await iam.detachRolePolicy({ RoleName, PolicyArn: "arn:aws:iam::aws:policy/AmazonEC2FullAccess" }).promise();
  p.push(iam.deleteRole({ RoleName }).promise());

  await Promise.all(p);
  info("cleanUp done");
}

function createConfig(region, accessKeyId, secretAccessKey) {
  const awsConfig = { region };
  if (typeof accessKeyId === "string") {
    awsConfig.accessKeyId = accessKeyId;
  }
  if (typeof secretAccessKey === "string") {
    awsConfig.secretAccessKey = secretAccessKey;
  }
  return awsConfig;
}

function createEC2Object(region, accessKeyId, secretAccessKey) {
  const awsConfig = createConfig(region, accessKeyId, secretAccessKey);
  awsConfig.maxRetries = 100;
  return new AWS.EC2(awsConfig);
}
function createIAMObject(region, accessKeyId, secretAccessKey) {
  const awsConfig = createConfig(region, accessKeyId, secretAccessKey);
  return new AWS.IAM(awsConfig);
}

function getRegion(clusterID) {
  const rt = /^abc4_aws_(.*)_.*/.exec(clusterID);
  const region = rt[1];
  if (typeof region !== "string") {
    const err = new Error("Invalid cluster id");
    err.message = "get region string from id failed";
    err.clusterID = clusterID;
    err.region = region;
    throw err;
  }
  return region;
}

function parseOrder(order) {
  if (typeof order.region !== "string") {
    const err = new Error("Invalid order");
    err.message = "Invalid aws region specified";
    err.region = order.region;
    throw err;
  }
  const os = order.os.toLowerCase();
  const region = order.region.toLowerCase();
  const id = order.id;
  const pw = order.pw;
  const numberOfNodes = order.numNodes;
  const headOnlyParam = order.headOnlyParam;
  const shareStorage = order.shareStorage;
  const rootVolume = order.rootVolume;
  const publicKey = order.publicKey;
  const batch = order.batch;
  const mpi = order.mpi;
  const compiler = order.compiler;
  debug({ os, region, numberOfNodes, shareStorage, rootVolume, batch, mpi, compiler });

  const remaining = JSON.parse(JSON.stringify(order));
  delete remaining.provider;
  delete remaining.numNodes;
  delete remaining.os;
  delete remaining.id;
  delete remaining.pw;
  delete remaining.region;
  delete remaining.headOnlyParam;
  delete remaining.shareStorage;
  delete remaining.rootVolume;
  delete remaining.publicKey;
  delete remaining.batch;
  delete remaining.mpi;
  delete remaining.compiler;

  return [os, region, id, pw, numberOfNodes, headOnlyParam, rootVolume, shareStorage, publicKey, batch, mpi, compiler, remaining];
}

async function waitForWrapper(service, event, param) {
  debug(`waiting for ${event}`);
  let rt = await service.waitFor(event, param).promise();
  let NextToken = rt.NextToken;
  while (NextToken != null) {
    debug("NextToken found, try again");
    rt = await service.waitFor(event, Object.assign(param, { NextToken })).promise();
    NextToken = rt.NextToken;
  }
  debug(`${event} done`);
  return rt;
}

//public functions
/*eslint-enable valid-jsdoc require-jsdoc*/
/**
 * get latest AMI ID of official image on AWS market place
 * @param {string} os - os name in all lower case
 * @param {string} region - AWS region string
 * @param {string} accessKeyId - access key
 * @param {string} secretAccessKey - secret access key
 * @returns {string} - ImageID
 */
async function getImage(os, region, accessKeyId, secretAccessKey) {
  debug("search AMI ID for ", os, "in", region);
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);
  const Filters = getAMIQueryFilter(os);
  if (Filters === null) {
    debug("Invalid OS specified");
    const err = new Error("Invelid OS specified");
    err.os = os;
    err.region = region;
    return Promise.reject(err);
  }

  const rt = await ec2.describeImages({ ExecutableUsers: ["self", "all"], Filters }).promise();
  if (rt.Images.length === 0) {
    debug("OS image not found");
    const err = new Error("OS ImageId not found");
    err.os = os;
    err.region = region;
    err.filter = Filters;
    return Promise.reject(err);
  }
  debug("Candidates:", rt.Images.map((e)=>{
    return { date: e.CreationDate, ID: e.ImageId };
  }));

  const latest = rt.Images
    .filter((e)=>{
      return e.CreationDate;
    })
    .reduce((a, c)=>{
      return c.CreationDate > a.CreationDate ? c : a;
    });
  debug("latest image:", latest);
  return latest;
}

/**
 * create cluster on AWS
 * @param {Order}
 * @param {function} debug - call back routine for log message
 * @return {Cluster}
 */
async function awsCreate(order) {
  setLogger(order);
  debug("create cluster on aws:", order);
  const [os,
    region,
    accessKeyId,
    secretAccessKey,
    numberOfNodes,
    headOnlyParam,
    rootVolume,
    shareStorage,
    PublicKeyMaterial,
    batch,
    mpi,
    compiler,
    remaining] = parseOrder(order);

  //get ami id
  const image = await getImage(os, region, accessKeyId, secretAccessKey);
  const ImageId = image.ImageId;

  //get root device setting of AMI
  const rootDevice = image.BlockDeviceMappings.find((e)=>{
    return e.DeviceName === "/dev/sda1" || e.DeviceName === "/dev/xvda";
  });
  debug("original:", rootDevice);
  delete rootDevice.Ebs.SnapshotId;
  delete rootDevice.Ebs.Encrypted;

  //generate uuid and create cluster instance object (return value of this function)
  const clusterID = `abc4_aws_${region}_${uuidv1()}`;
  const cluster = {
    clusterID
  };

  //instanciate service objects
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);

  //create KeyPair, IAM Role and VPC
  const iam = createIAMObject(region, accessKeyId, secretAccessKey);
  const RoleName = clusterID;
  const InstanceProfileName = clusterID;
  const InstanceProfileArn = await setupIAMRole(iam, RoleName);

  const KeyName = clusterID;
  const key = await setupKeyPair(ec2, KeyName, PublicKeyMaterial);
  if (key) {
    cluster.privateKey = key;
  }


  //
  //create parameter objects
  //

  //this value does not changed!!
  const numHeadNode = 1;
  const numChildNodes = numberOfNodes - numHeadNode;

  rootDevice.Ebs.DeleteOnTermination = true;
  const expandRootVolume = rootVolume > rootDevice.Ebs.VolumeSize;
  rootDevice.Ebs.VolumeSize = expandRootVolume ? rootVolume : rootDevice.Ebs.VolumeSize;

  const TagSpecifications = [{
    ResourceType: "instance",
    Tags: [
      { Key: "abc4", Value: `${(new Date()).toTimeString()}` },
      { Key: "abc4ClusterId", Value: clusterID }
    ]
  }];

  const user = getUserName(os);
  const group = getUserName(os);

  const inventory = "/etc/ansible/hosts"; //ansible's defalut path
  const playbookDir = "/var/abc4";
  const shostsEquiv = "/etc/ssh/shosts.equiv";
  const shostsRoot = "/root/.shosts";
  const hosts = "/etc/hosts";

  //create runcmd
  const makeShostsEquiv = [
    `aws ec2 describe-instances --output=text --region=${region}\
    --filter "Name=tag:abc4ClusterId,Values=${clusterID}"\
    --query 'Reservations[].Instances[].[PrivateIpAddress,PrivateDnsName]'\
    |tr '\\t' '\\n' > ${shostsEquiv}`,
    `awk -i inplace 'BEGIN{FS="."} {print $0} /internal/{print $1}' ${shostsEquiv}`,
    `cp ${shostsEquiv} ${shostsRoot}`,
    "echo generate shosts.equiv done ",
    `cat ${shostsEquiv}`
  ];

  const makeHosts = `sed -e 'N;s/\\n/ /' ${shostsEquiv} | awk 'BEGIN{FS=".";OFS="."}{print $1,$2,$3,$4}' >${hosts} &&echo generate hosts done && cat ${hosts}`;
  const makeInventory = [
    `(echo '[head]'  &&\
    echo \`hostname\` &&\
    echo '[child]' &&\
    grep -v -e \`hostname\` -e '\\.' ${shostsEquiv}) >> ${inventory}`,
    `chmod +r ${inventory}`,
    "echo generate inventory file done",
    `cat ${inventory}`
  ];

  //ansible is used only in head node
  const headUserDataObject = {
    packages: ["python", "awscli"],
    runcmd: [
      ...makeShostsEquiv,
      ...enableSshHostBasedAuthentication(os),
      keyScan(shostsEquiv, `~${user}/.ssh/known_hosts`, user, group, 644),
      installAnsible(os),
      ...makeInventory,
      ...runPlaybooks(user, playbookDir, shareStorage, batch, mpi, compiler)
    ],
    write_files: getPlaybookNames(shareStorage, batch, mpi, compiler).map((e)=>{
      return {
        path: `${playbookDir}/${e}.yml`,
        mode: 755,
        content: `${getPlaybook(e)}`
      };
    })
  };
  const childUserDataObject = {
    packages: ["python", "awscli"],
    runcmd: [
      ...makeShostsEquiv,
      ...enableSshHostBasedAuthentication(os, true),
      keyScan(shostsEquiv, `~${user}/.ssh/known_hosts`, user, group, 644)
    ]
  };

  const headParam = Object.assign(JSON.parse(JSON.stringify(remaining)), headOnlyParam, {
    ImageId,
    IamInstanceProfile: { Arn: InstanceProfileArn, Name: InstanceProfileName },
    TagSpecifications,
    MinCount: numHeadNode,
    MaxCount: numHeadNode,
    KeyName,
    BlockDeviceMappings: [
      rootDevice
    ],
    UserData: Base64.encode(`#cloud-config\n ${JSON.stringify(headUserDataObject)}`)
  });
  const childParam = Object.assign(remaining, {
    ImageId,
    IamInstanceProfile: { Arn: InstanceProfileArn, Name: InstanceProfileName },
    TagSpecifications,
    MinCount: numChildNodes,
    MaxCount: numChildNodes,
    BlockDeviceMappings: [
      rootDevice
    ],
    UserData: Base64.encode(`#cloud-config\n ${JSON.stringify(childUserDataObject)}`)
  });

  let headInstanceIds = [];
  let childInstanceIds = [];
  function onRetry(res) {
    if (res.error.code === "InvalidParameterValue" && res.error.message.endsWith("Invalid IAM Instance Profile name")) {
      debug(`IAM instance profile is not available, retrying ${res.retryCount}`);
      res.error.retryable = true;
      res.error.retryDelay = 3000;
    }
  }
  try {
    const promises = [];
    info("create head node");
    promises.push(
      ec2.runInstances(headParam)
        .on("retry", onRetry)
        .promise()
    );

    if (numChildNodes > 0) {
      info(`create ${numChildNodes} child nodes`);
      promises.push(
        ec2.runInstances(childParam)
          .on("retry", onRetry)
          .promise()
      );
    }
    const results = await Promise.all(promises);

    if (results[0].Instances.length !== numHeadNode) {
      const err = new Error("head node creation failed");
      return err;
    }
    headInstanceIds = results[0].Instances.map((e)=>{
      return e.InstanceId;
    });
    debug(headInstanceIds);

    if (numChildNodes > 0) {
      if (results[1].Instances.length !== numChildNodes) {
        const err = new Error("child node creation failed");
        return err;
      }
      childInstanceIds = results[1].Instances.map((e)=>{
        return e.InstanceId;
      });
      debug(childInstanceIds);
    }
  } catch (err) {
    const p = [];
    info("fatal error occurred during cluster creation process");
    info("clean up partitially created resources and exit");
    p.push(creanUp(region, accessKeyId, secretAccessKey, KeyName, InstanceProfileName, RoleName));
    p.push(awsDestroy(clusterID, accessKeyId, secretAccessKey));

    try {
      await Promise.all(p);
    } catch (errCleanupPhase) {
      err.cleanupPhase = errCleanupPhase;
    }
    throw err;
  }

  //
  //wait for all instance is available
  //
  await waitForWrapper(ec2, "instanceExists", { InstanceIds: headInstanceIds.concat(childInstanceIds) });
  info("bootup process started");
  await waitForWrapper(ec2, "instanceRunning", { InstanceIds: headInstanceIds.concat(childInstanceIds) });
  info("OS ready");
  await waitForWrapper(ec2, "instanceStatusOk", { InstanceIds: headInstanceIds.concat(childInstanceIds) });
  info("system check done");

  //gather info to return
  const instances = await awsListInstances(clusterID, order);

  cluster.headNodes = instances
    .filter((e)=>{
      return headInstanceIds.includes(e.InstanceId);
    })
    .map((e)=>{
      return {
        publicNetwork: { IP: e.PublicIpAddress, hostname: e.PublicDnsName },
        privateNetwork: { IP: e.PrivateIpAddress, hostname: e.PrivateDnsName }
      };
    });
  cluster.childNodes = instances
    .filter((e)=>{
      return !headInstanceIds.includes(e.InstanceId);
    })
    .map((e)=>{
      return {
        privateNetwork: { IP: e.PrivateIpAddress, hostname: e.PrivateDnsName }
      };
    });
  cluster.user = user;
  info("clean up temporary resouces");
  await creanUp(region, accessKeyId, secretAccessKey, KeyName, InstanceProfileName, RoleName);

  if (accessKeyId) {
    cluster.id = accessKeyId;
  }
  if (secretAccessKey) {
    cluster.pw = secretAccessKey;
  }
  debug(JSON.stringify(cluster, (k, v)=>{
    if (k === "id" || k === "pw" || k === "privateKey") {
      return "XXXX";
    }
    return v;
  }, 2));
  return cluster;
}

/**
 * destroy specified cluster
 */
async function awsDestroy(clusterID, opt) {
  setLogger(opt);
  info("destroy cluster on aws:", clusterID);
  const accessKeyId = opt.id;
  const secretAccessKey = opt.pw;
  const instances = await awsListInstances(clusterID, opt);
  const region = getRegion(clusterID);
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);
  const InstanceIds = instances.map((e)=>{
    return e.InstanceId;
  });
  if (InstanceIds.length === 0) {
    debug("no instance to be terminated");
    return true;
  }
  debug("destroy instances", InstanceIds);
  await ec2.terminateInstances({ InstanceIds }).promise();
  return waitForWrapper(ec2, "instanceTerminated", { InstanceIds });
}

/**
 * list up instances in the specified cluster
 */
async function awsListInstances(clusterID, opt) {
  setLogger(opt);
  debug("list up cluster on aws:", clusterID);
  const accessKeyId = opt.id;
  const secretAccessKey = opt.pw;

  const region = getRegion(clusterID);
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);

  //TODO use NextToken and get instances repeatedly
  const result = await ec2.describeInstances({
    Filters: [
      { Name: "tag:abc4ClusterId", Values: [clusterID] },
      { Name: "instance-state-name", Values: ["pending", "running"] }
    ]
  }).promise();

  const instances = result.Reservations
    .reduce((a, c)=>{
      return a.concat(c.Instances);
    }, []);
  info(`${instances.rength} node found`);
  debug(instances);
  return instances;
}

module.exports = {
  getImage,
  awsCreate,
  awsDestroy,
  awsListInstances
};
