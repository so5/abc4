"use strict";
const info = require("debug")("abc4:info");
const debug = require("debug")("abc4:aws");
const uuidv1 = require("uuid/v1");
const Base64 = require("js-base64").Base64;
const AWS = require("aws-sdk");
AWS.config.update({ logger: { log: debug } });
const { OSFilters, defaultFilter } = require("./queryFilters");
const { getSshHostBasedAutScript, changePermission, keyScan } = require("../../common/setupScripts");
const { getPlaybook } = require("../../common/playbook");

//private functions
/*eslint-disable valid-jsdoc require-jsdoc*/
function getUserName(os) {
  if (os.startsWith("centos")) {
    return "centos";
  }
  if (os.startsWith("ubuntu")) {
    return "ubuntu";
  }
  return "ec2-user";
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
  await iam.createInstanceProfile({ InstanceProfileName }).promise();
  await iam.addRoleToInstanceProfile({ InstanceProfileName, RoleName }).promise();
  return RoleName;
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

  return Promise.all(p);
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
  return new AWS.EC2(awsConfig);
}
function createIAMObject(region, accessKeyId, secretAccessKey) {
  const awsConfig = createConfig(region, accessKeyId, secretAccessKey);
  return new AWS.IAM(awsConfig);
}

function parseID(id) {
  const [, region] = /^abc4_aws_(.*)_.*/.exec(id);
  if (typeof region !== "string") {
    debug("region parse failed", id, region);
    const err = new Error("region parse failed");
    err.id = id;
    err.region = region;
    throw err;
  }
  return region;
}

function parseOrder(order) {
  const os = order.os.toLowerCase();
  const region = order.region.toLowerCase();
  const id = order.id;
  const pw = order.pw;
  const numberOfNodes = order.numNodes;
  const headOnlyParam = order.headOnlyParam;
  const nfsVolume = order.nfsVolume;
  const publicKey = order.publicKey;
  const batch = order.batch;
  const mpi = order.mpi;

  const remaining = JSON.parse(JSON.stringify(order));
  delete remaining.provider;
  delete remaining.numNodes;
  delete remaining.os;
  delete remaining.id;
  delete remaining.pw;
  delete remaining.region;
  delete remaining.headOnlyParam;
  delete remaining.nfsVolume;
  delete remaining.publicKey;
  delete remaining.batch;
  delete remaining.mpi;

  return [os, region, id, pw, numberOfNodes, headOnlyParam, nfsVolume, publicKey, batch, mpi, remaining];
}

async function waitForWrapper(service, event, param) {
  let rt = await service.waitFor(event, param).promise();
  let NextToken = rt.NextToken;
  while (NextToken != null) {
    rt = await service.waitFor(event, Object.assign(param, { NextToken })).promise();
    NextToken = rt.NextToken;
  }
  return rt;

  //return new Prommis((resolve, reject)=>{
  //service.waitFor(event, param)
  //.on("complete", (res)=>{
  //if(res.error){
  //reject();
  //}
  //if(!res.hasNextPage()){
  //resolve(res);
  //}
  //});
  //});
}

async function getRootDevice(os, region, ImageId, accessKeyId, secretAccessKey) {
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);
  const rt = await ec2.describeImages({ ImageIds: [ImageId] }).promise();
  debug(rt.Images);
  const rootDevice = rt.Images[0].BlockDeviceMappings.find((e)=>{
    return e.DeviceName === "/dev/sda1" || e.DeviceName === "/dev/xvda";
  });
  debug(rootDevice);
  delete rootDevice.Ebs.SnapshotId;
  delete rootDevice.Ebs.VolumeSize;
  delete rootDevice.Ebs.Encrypted;
  return rootDevice;
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
async function getImageId(os, region, accessKeyId, secretAccessKey) {
  debug("search AMI ID for ", os, "in", region);

  if (typeof region !== "string") {
    debug("invalid region specified", region);
    const err = new Error("Invalid region specified");
    err.region = region;
    return Promise.reject(err);
  }
  const osFilter = OSFilters[os];
  if (!osFilter) {
    debug("invalid os specified", os);
    const err = new Error("Invalid os specified");
    err.os = os;
    return Promise.reject(err);
  }

  //do not catch in createEC2Object here
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);

  const Filters = defaultFilter.concat(osFilter);
  const rt = await ec2.describeImages({ ExecutableUsers: ["self", "all"], Filters }).promise();
  if (rt.Images.length === 0) {
    debug("no OS image found");
    const err = new Error("os ImageId not found");
    err.os = os;
    err.region = region;
    err.filter = osFilter;
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
  return latest.ImageId;
}

/**
 * create cluster on AWS
 * @param {Object} order - option argument for EC2.create with some special options
 * @return {string} id string used for tag
 */
async function awsCreate(order) {
  info("create cluster on aws:", order);
  const [os, region, accessKeyId, secretAccessKey, numberOfNodes, headOnlyParam, nfsVolume, PublicKeyMaterial, batch, mpi, remaining] = parseOrder(order);

  //get ami id
  const ImageId = await getImageId(os, region);

  //generate uuid and create cluster instance object (return value of this function)
  const clusterID = `abc4_aws_${region}_${uuidv1()}`;
  const cluster = {
    id: clusterID
  };

  //instanciate service objects
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);
  const iam = createIAMObject(region, accessKeyId, secretAccessKey);

  //create KeyPair, IAM Role and VPC
  const RoleName = clusterID;
  const InstanceProfileName = clusterID;
  await setupIAMRole(iam, RoleName);

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

  const rootDevice = await getRootDevice(os, region, ImageId, accessKeyId, secretAccessKey);
  rootDevice.Ebs.DeleteOnTermination = true;
  const nfs = nfsVolume === 0 ? null : {
    DeviceName: "/dev/sdb",
    Ebs: {
      DeleteOnTermination: true,
      Volume: nfsVolume
    }
  };
  const TagSpecifications = [{
    ResourceType: "instance",
    Tags: [
      { Key: "abc4", Value: `${(new Date()).toTimeString()}` },
      { Key: "abc4ClusterId", Value: clusterID }
    ]
  }];

  const user = getUserName(os);
  const group = getUserName(os);
  const inventory = "/etc/ansible/hosts"; // ansible's defalut path
  const shostsEquiv = "/etc/ssh/shosts.equiv";
  //TODO make following scripts works when reboot and add instance
  const makeShostsEquiv = `aws ec2 describe-instances --output=text --region=${region} --filter "Name=tag:abc4ClusterId,Values=${clusterID}" --query 'Reservations[].Instances[].[PrivateIpAddress,PrivateDnsName]' |tr '\\t' '\\n' | sort > ${shostsEquiv}`;
  const makeInventory=`(echo '[head]'  && echo \`hostname -i\` && echo '[child]' && grep -v -e internal -e \`hostname -i\` ${shostsEquiv}) >> ${inventory} && chmod +r ${inventory}`

  const sshHostbasedAuth = getSshHostBasedAutScript();

  //ansible is used only in head node
  const headUserDataObject = {
    packages: ["ansible", "awscli", "curl"],
    runcmd: [
      makeShostsEquiv,
      ...sshHostbasedAuth,
      keyScan(shostsEquiv, `~${user}/.ssh/known_hosts`, user, group, 644),
      makeInventory
    ],
    write_files: [
      {
        path: "/root/.abc4/playbook/test.yml",
        content: await getPlaybook("test")
      }
    ]
  };
  const childUserDataObject = {
    packages: ["python", "awscli"],
    runcmd: [
      makeShostsEquiv,
      ...sshHostbasedAuth,
      keyScan(shostsEquiv, `~${user}/.ssh/known_hosts`, user, group, 644)
    ]
  };

  const headParam = Object.assign(JSON.parse(JSON.stringify(remaining)), headOnlyParam, {
    ImageId,
    IamInstanceProfile: { Name: InstanceProfileName },
    TagSpecifications,
    MinCount: numHeadNode,
    MaxCount: numHeadNode,
    BlockDeviceMappings: [
      rootDevice
    ],
    UserData: Base64.encode(`#cloud-config\n ${JSON.stringify(headUserDataObject)}`)
  });
  if (nfs) {
    headParam.BlockDeviceMappings.push(nfs);
  }
  const childParam = Object.assign(remaining, {
    ImageId,
    IamInstanceProfile: { Name: InstanceProfileName },
    TagSpecifications,
    MinCount: numChildNodes,
    MaxCount: numChildNodes,
    KeyName,
    BlockDeviceMappings: [
      rootDevice
    ],
    UserData: Base64.encode(`#cloud-config\n ${JSON.stringify(childUserDataObject)}`)
  });

  const maxRetry = 100;
  let headInstanceIds = [];
  let childInstanceIds = [];
  try {
    info("create head node");
    let retryCount = 0;
    const result = await ec2.runInstances(headParam)
      .on("retry", (res)=>{
        if (retryCount < maxRetry && res.error.code === "InvalidParameterValue" && res.error.message.endsWith("Invalid IAM Instance Profile name")) {
          debug(`IAM instance profile is not available, retry ${retryCount}/${maxRetry} `);
          res.error.retryable = true;
          res.error.retryDelay = 3000;
          ++retryCount;
        }
      })
      .promise();

    if (result.Instances.length !== numHeadNode) {
      const err = new Error("head node creation failed");
      return err;
    }
    headInstanceIds = result.Instances.map((e)=>{
      return e.InstanceId;
    });
    debug(headInstanceIds);

    if (numChildNodes > 0) {
      info(`create  child nodes: ${numChildNodes}`);
      let retryCount2 = 0;
      const result2 = await ec2.runInstances(childParam)
        .on("retry", (res)=>{
          if (retryCount2 < maxRetry && res.error.code === "InvalidParameterValue" && res.error.message.endsWith("Invalid IAM Instance Profile name")) {
            debug(`IAM instance profile is not available, retry ${retryCount2}/${maxRetry} `);
            res.error.retryable = true;
            res.error.retryDelay = 3000;
            ++retryCount2;
          }
        })
        .promise();
      if (result2.Instances.length !== numChildNodes) {
        const err = new Error("child node creation failed");
        return err;
      }
      childInstanceIds=result2.Instances.map((e)=>{
        return e.InstanceId;
      });
      debug( childInstanceIds);
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
  await waitForWrapper(ec2, "instanceStatusOk", { InstanceIds: headInstanceIds.concat(childInstanceIds) });
  info("create cluster on aws done");

  //gather info to return
  const instances = await awsListInstances(clusterID, accessKeyId, secretAccessKey);

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
      return ! headInstanceIds.includes(e.InstanceId);
    })
    .map((e)=>{
      return {
        privateNetwork: { IP: e.PrivateIpAddress, hostname: e.PrivateDnsName }
      };
    });

  cluster.loginUser = user;

  info("clean up temporary resouces");
  await creanUp(region, accessKeyId, secretAccessKey, KeyName, InstanceProfileName, RoleName);
  debug("cluster");
  return cluster;
}

/**
 * destroy specified cluster
 */
async function awsDestroy(id, accessKeyId, secretAccessKey) {
  info("destroy cluster on aws:", id);
  const instances = await awsListInstances(id, accessKeyId, secretAccessKey);
  const region = parseID(id);
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);
  const InstanceIds = instances.map((e)=>{
    return e.InstanceId;
  });
  if (InstanceIds.length === 0) {
    debug("no instance to be terminated");
    return;
  }
  debug("destroy instances", InstanceIds);
  await ec2.terminateInstances({ InstanceIds }).promise();
  return waitForWrapper(ec2, "instanceTerminated", { InstanceIds });
}

/**
 * list up instances in the specified cluster
 */
async function awsListInstances(id, accessKeyId, secretAccessKey) {
  info("list up cluster on aws:", id);

  const region = parseID(id);
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);

  //TODO use NextToken and get instances repeatedly
  const result = await ec2.describeInstances({
    Filters: [
      { Name: "tag:abc4ClusterId", Values: [id] }
    ]
  }).promise();

  const instances = result.Reservations
    .reduce((a, c)=>{
      return a.concat(c.Instances);
    }, []);
  debug(instances);
  return instances;
}

module.exports = {
  getImageId,
  awsCreate,
  awsDestroy,
  awsListInstances
};
