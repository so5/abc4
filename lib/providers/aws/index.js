"use strict";
const info = require("info")("abc4:aws");
const debug = require("debug")("abc4-verbose:aws");
const uuidv1 = require("uuid/v1");
const Base64 = require("js-base64").Base64;
const AWS = require("aws-sdk");
AWS.config.update({ logger: { log: debug } });
const { OSFilters, defaultFilter } = require("./queryFilters");

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
  debug("create IAM role");
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
  debug("remove keyPair");
  p.push(ec2.deleteKeyPair({ KeyName }).promise());
  debug("remove IAM role");
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
  const numberOfNodes = order.numNodes || 1;
  const headOnlyParam = order.headOnlyParam || {};
  const nfsVolume = order.nfsVolume || 0;
  const publicKey = order.publicKey;

  const remaining = JSON.parse(JSON.stringify(order));
  delete remaining.provider;
  delete remaining.numNodes;
  delete remaining.os;
  delete remaining.id;
  delete remaining.pw;
  delete remaining.region;
  delete remaining.headOnlyParam;
  delete remaining.publicKey;

  return [os, region, id, pw, numberOfNodes, headOnlyParam, nfsVolume, publicKey, remaining];
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
    info("invalid region specified", region);
    const err = new Error("Invalid region specified");
    err.region = region;
    return Promise.reject(err);
  }
  const osFilter = OSFilters[os];
  if (!osFilter) {
    info("invalid os specified", os);
    const err = new Error("Invalid os specified");
    err.os = os;
    return Promise.reject(err);
  }

  //do not catch in createEC2Object here
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);

  const Filters = defaultFilter.concat(osFilter);
  const rt = await ec2.describeImages({ ExecutableUsers: ["self", "all"], Filters }).promise();
  if (rt.Images.length === 0) {
    info("no OS image found");
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
  const [os, region, accessKeyId, secretAccessKey, numberOfNodes, headOnlyParam, nfsVolume, PublicKeyMaterial, remaining] = parseOrder(order);

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

  //TODO スクリプト側でregionをinstance meta dataから取得するように変更
  //IP addressもやっぱり取得したい
  const makeShostsEquiv = `aws ec2 describe-instances --output=text --region=${region} --filter "Name=tag:abc4ClusterId,Values=${clusterID}" -query 'Reservations[].Instances[].[PrivateDnsName,PrivateIpAddress]' |tr '\t' '\n' |sort > /etc/ssh/shosts.equiv`;

  const sshdConf = "/etc/ssh/sshd_config";
  const sshConf = "/etc/ssh/ssh_config";
  const shostsEquiv = "/etc/ssh/shosts.equiv";
  const knownHosts = "/etc/ssh/ssh_known_hosts";
  const inventory = "/root/hosts";
  const keySign = "/usr/libexec/openssh/ssh-keysign";

  const keyScan = `for i in \`cat ${shostsEquiv}\`;do ssh-keyscan $i >> ${knownHosts};done`;
  const keyScanForUser = `for i in \`cat ${shostsEquiv}\`;do sudo -u ${getUserName(os)} ssh-keyscan $i >> ~${getUserName(os)}/.ssh/known_hosts;done`;
  const modifySshdConf = `if head -n1 ${sshdConf} | grep -qv 'HostbasedAuthentication yes';then
  mv ${sshdConf} ${sshdConf}.org
  sed '1iHostbasedAuthentication yes\\n'  ${sshdConf}.org > ${sshdConf}
  fi`;
  const modifySshConf = `if head -n1 ${sshConf} | grep -qv 'HostbasedAuthentication yes';then
  mv ${sshConf} ${sshConf}.org
  sed '1iHostBasedAuthentication yes\\nEnableSSHKeysign yes\\nNoHostAuthenticationForLocalhost yes\\n' ${sshConf}.org > ${sshConf}
  fi`;

  const restartSshd = "systemctl restart sshd";


  //ansible is used only in head node
  const headUserDataObject = {
    packages: ["ansible", "awscli"],
    runcmd: [
      makeShostsEquiv,
      keyScan,
      modifySshdConf,
      modifySshConf,
      `chown root:root ${keySign}`,
      `chmod 04755 ${keySign}`,
      restartSshd,
      keyScanForUser,
      `grep -v internal ${shostsEquiv} > ${inventory}`,
      `chmod ugo+r ${inventory}`,
      `sudo -u ${getUserName(os)} ansible all -i ${inventory} -m ping`
    ]
  };
  const childUserDataObject = {
    packages: ["python", "awscli"],
    runcmd: [
      makeShostsEquiv,
      keyScan,
      modifySshdConf,
      modifySshConf,
      "chown root:root /usr/libexec/openssh/ssh-keysign",
      "chmod 04755 /usr/libexec/openssh/ssh-keysign",
      restartSshd,
      keyScanForUser
    ]
  };

  const headParam = Object.assign(JSON.parse(JSON.stringify(remaining)), headOnlyParam, {
    ImageId,
    IamInstanceProfile: { Name: InstanceProfileName },
    TagSpecifications,
    MinCount: numHeadNode,
    MaxCount: numHeadNode,
    KeyName,
    BlockDeviceMappings: [
      rootDevice
    ],
    NetworkInterfaces: [
      {
        AssociatePublicIpAddress: true,
        DeviceIndex: 0
      }
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
    NetworkInterfaces: [
      {
        AssociatePublicIpAddress: true, //TODO to be changed to false
        DeviceIndex: 0
      }
    ],
    UserData: Base64.encode(`#cloud-config\n ${JSON.stringify(childUserDataObject)}`)
  });

  const maxRetry = 100;
  info("creating head node");
  let InstanceIds = [];
  try {
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

    InstanceIds.push(result.Instances[0].InstanceId);

    if (InstanceIds.length !== numHeadNode) {
      const err = new Error("head node creation failed");
      throw err;
    }


    if (numChildNodes > 0) {
      info(`creating ${numChildNodes} child nodes`);
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
      InstanceIds = InstanceIds.concat(result2.Instances.map((e)=>{
        return e.InstanceId;
      }));
    }
  } catch (err) {
    const p = [];
    info("fatal error occurred while creating head node");
    info("clean up partitially created resources");
    p.push(creanUp(region, accessKeyId, secretAccessKey, KeyName, InstanceProfileName, RoleName));
    p.push(awsDestroy(clusterID, accessKeyId, secretAccessKey));

    try {
      await Promise.all(p);
    } catch (errCleanupPhase) {
      err.cleanupPhase = errCleanupPhase;
    }
    throw err;
  }
  debug(InstanceIds);

  //
  //wait for all instance is available
  //
  await waitForWrapper(ec2, "instanceStatusOk", { InstanceIds });

  //update nodes
  const result = await ec2.describeInstances({ InstanceIds }).promise();
  const nodes = result.Reservations
    .reduce((a, c)=>{
      return a.concat(c.Instances);
    }, []);

  //following code may not work if multi NIC is specified
  cluster.headNodes = nodes
    .filter((e)=>{
      return e.PublicIpAddress;
    })
    .map((e)=>{
      return { ipaddress: e.PublicIpAddress, hostname: e.PublicDnsName };
    });
  cluster.privateNetwork = nodes.map((e)=>{
    return { ipaddress: e.PrivateIpAddress, hostname: e.PrivateDnsName };
  });

  cluster.loginUser = getUserName(os);

  await creanUp(region, accessKeyId, secretAccessKey, KeyName, InstanceProfileName, RoleName);
  info("create cluster done", cluster);
  return cluster;
}

/**
 * destroy specified cluster
 */
async function awsDestroy(id, accessKeyId, secretAccessKey) {
  const instances = await awsListInstances(id, accessKeyId, secretAccessKey);
  const region = parseID(id);
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);
  const InstanceIds = instances.map((e)=>{
    return e.InstanceId;
  });
  return ec2.stopInstances({ InstanceIds }).promise();
  debug("destroy cluster done");
}

/**
 * list up instances in the specified cluster
 */
async function awsListInstances(id, accessKeyId, secretAccessKey) {
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
