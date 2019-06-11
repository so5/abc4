"use strict";
const debugLib = require("debug");
const info = debugLib("abc4:info");
const debug = debugLib("abc4:aws");
const sdklog = debugLib("abc4:aws-sdk");
const uuidv1 = require("uuid/v1");
const Base64 = require("js-base64").Base64;
const AWS = require("aws-sdk");
AWS.config.update({ logger: { log: sdklog } });
const { getUserName, getGroupName } = require("./osDependent");
const { getUserData } = require("../../common/setupScripts");
const { maskSensitiveValues } = require("../../common/util.js");
const { setupIAMRole, setupKeyPair, setupVPC, getImage, cleanUp, cleanUpKeyPair, createEC2Object, createIAMObject } = require("./internal.js");

//private functions
/*eslint-disable valid-jsdoc require-jsdoc*/
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

/**
 * Check region value in order and extract it.
 * @param {Object} order
 * @returns {string} - Region string.
 */
function extractRegion(order) {
  if (typeof order.region !== "string") {
    const err = new Error("Invalid order");
    err.message = "Invalid aws region specified";
    err.region = order.region;
    throw err;
  }
  const region = order.region.toLowerCase();
  delete order.region;
  return region;
}

function parseOrder(order) {
  const commonOpt = {
    os: order.os.toLowerCase(),
    shareStorage: order.shareStorage,
    batch: order.batch,
    runJobOnBatchServer: order.runJobOnBatchServer,
    mpi: order.mpi,
    compiler: order.compiler,
    playbook: order.playbook,
    batchSetupScript: order.batchSetupScript,
    packages: order.packages
  };

  const id = order.id;
  const pw = order.pw;
  const numberOfNodes = order.numNodes;
  const headOnlyParam = order.headOnlyParam;
  const rootVolume = order.rootVolume;
  const publicKey = order.publicKey;

  const remaining = JSON.parse(JSON.stringify(order));
  delete remaining.provider;
  delete remaining.numNodes;
  delete remaining.os;
  delete remaining.id;
  delete remaining.pw;
  delete remaining.headOnlyParam;
  delete remaining.shareStorage;
  delete remaining.rootVolume;
  delete remaining.publicKey;
  delete remaining.batch;
  delete remaining.runJobOnBatchServer;
  delete remaining.mpi;
  delete remaining.compiler;
  delete remaining.playbook;
  delete remaining.batchSetupScript;
  delete remaining.packages;

  return [id, pw, numberOfNodes, headOnlyParam, rootVolume, publicKey, commonOpt, remaining];
}

async function waitForWrapper(service, event, param) {
  debug(`waiting for ${event}`);
  let rt = await service.waitFor(event, param).promise();
  let NextToken = rt.NextToken;
  while (NextToken) {
    debug("NextToken found, try again");
    rt = await service.waitFor(event, Object.assign(param, { NextToken })).promise();
    NextToken = rt.NextToken;
  }
  debug(`${event} done`);
  return rt;
}

function onRetry(res) {
  if (res.error.code === "InvalidParameterValue" && res.error.message.endsWith("Invalid IAM Instance Profile name")) {
    debug(`IAM instance profile is not available, retrying ${res.retryCount}`);
    res.error.retryable = true;
    res.error.retryDelay = 3000;
  } else if (res.error.code === "InsufficientInstanceCapacity") {
    info("can not get sufficient instace in specified AZ");
    res.error.retryable = false;
  } else {
    debug(`retring due to ${res.error}`);
  }
}

//public functions
/*eslint-enable valid-jsdoc require-jsdoc*/
/**
 * Create cluster on AWS.
 * @param {Order}
 * @param {Function} debug - Call back routine for log message.
 * @returns {Cluster}
 */
async function awsCreate(argOrder) {
  //setLogger(argOrder);
  const order = JSON.parse(JSON.stringify(argOrder));
  debug("create cluster on aws:", JSON.stringify(order, maskSensitiveValues, 2));

  const region = extractRegion(order);

  //generate uuid and create cluster instance object (return value of this function)
  const clusterID = `abc4_aws_${region}_${uuidv1()}`;
  const cluster = {
    clusterID
  };
  const [accessKeyId, secretAccessKey, numberOfNodes, headOnlyParam, rootVolume, PublicKeyMaterial, commonOpt, remaining] = parseOrder(order);

  //instanciate service objects
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);
  const iam = createIAMObject(region, accessKeyId, secretAccessKey);

  //get ami id
  const image = await getImage(commonOpt.os, region, ec2);
  const ImageId = image.ImageId;

  //this value does not changed!!
  const numHeadNode = 1;
  const numChildNodes = numberOfNodes - numHeadNode;

  //get root device setting of AMI
  const rootDevice = image.BlockDeviceMappings.find((e)=>{
    return e.DeviceName === "/dev/sda1" || e.DeviceName === "/dev/xvda";
  });
  debug("original:", rootDevice);
  //remove unused props
  delete rootDevice.Ebs.SnapshotId;
  delete rootDevice.Ebs.Encrypted;

  rootDevice.Ebs.DeleteOnTermination = true;
  const expandRootVolume = rootVolume > rootDevice.Ebs.VolumeSize;
  rootDevice.Ebs.VolumeSize = expandRootVolume ? rootVolume : rootDevice.Ebs.VolumeSize;

  const headTag = [{
    ResourceType: "instance",
    Tags: [
      { Key: "abc4", Value: `${(new Date()).toTimeString()}` },
      { Key: "abc4ClusterId", Value: clusterID }
    ]
  }];
  const childTag = JSON.parse(JSON.stringify(headTag));

  headTag[0].Tags.push({ Key: "abc4Class", Value: "Head" });
  childTag[0].Tags.push({ Key: "abc4Class", Value: "Child" });

  commonOpt.createIpList = `aws ec2 describe-instances --output=text --region=${region}\
    --filter "Name=tag:abc4ClusterId,Values=${clusterID}"\
    --query 'Reservations[].Instances[].[PrivateIpAddress]'`;
  commonOpt.createHostList = `aws ec2 describe-instances --output=text --region=${region}\
    --filter "Name=tag:abc4ClusterId,Values=${clusterID}"\
    --query 'Reservations[].Instances[].[PrivateDnsName]' |sed 's/^\\([^\\.]*\\).*$/\\1/'`;
  commonOpt.getHeadHostname = `aws ec2 describe-instances --output=text --region=${region}\
    --filters "Name=tag:abc4ClusterId,Values=${clusterID}" "Name=tag:abc4Class,Values=Head"\
    --query 'Reservations[].Instances[].[PrivateDnsName]' |sed 's/^\\([^\\.]*\\).*$/\\1/'`;

  cluster.user = getUserName(commonOpt.os);
  commonOpt.user = cluster.user;
  commonOpt.group = getGroupName(commonOpt.os);

  if (!Array.isArray(commonOpt.packages)) {
    commonOpt.packages = [];
  }
  commonOpt.packages.push("awscli");

  const headUserDataObject = getUserData(commonOpt);
  const childUserDataObject = getUserData(commonOpt, true);

  let headInstanceIds = [];
  let childInstanceIds = [];

  try {
  //create KeyPair, IAM Role and VPC
    const key = await setupKeyPair(ec2, clusterID, PublicKeyMaterial);
    if (key) {
      cluster.privateKey = key;
    }
    const InstanceProfileArn = await setupIAMRole(iam, clusterID);
    const [SubnetId, securityGroupId] = await setupVPC(ec2, clusterID);

    const headParam = Object.assign(JSON.parse(JSON.stringify(remaining)), headOnlyParam, {
      ImageId,
      IamInstanceProfile: { Arn: InstanceProfileArn, Name: clusterID },
      TagSpecifications: headTag,
      SubnetId,
      SecurityGroupIds: [securityGroupId],
      MinCount: numHeadNode,
      MaxCount: numHeadNode,
      KeyName: clusterID,
      BlockDeviceMappings: [
        rootDevice
      ],
      UserData: Base64.encode(`#cloud-config\n ${JSON.stringify(headUserDataObject)}`)
    });
    const childParam = Object.assign(remaining, {
      ImageId,
      IamInstanceProfile: { Arn: InstanceProfileArn, Name: clusterID },
      TagSpecifications: childTag,
      SubnetId,
      MinCount: numChildNodes,
      MaxCount: numChildNodes,
      BlockDeviceMappings: [
        rootDevice
      ],
      UserData: Base64.encode(`#cloud-config\n ${JSON.stringify(childUserDataObject)}`)
    });

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
    info("fatal error occurred during cluster creation process");
    info("clean up partitially created resources and exit");

    try {
      await awsDestroy(clusterID, accessKeyId, secretAccessKey);
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
  info("clean up temporary resouces");
  await cleanUpKeyPair(ec2, clusterID);

  if (accessKeyId) {
    cluster.id = accessKeyId;
  }
  if (secretAccessKey) {
    cluster.pw = secretAccessKey;
  }
  debug(JSON.stringify(cluster, maskSensitiveValues, 2));

  return cluster;
}

/**
 * Destroy specified cluster.
 */
async function awsDestroy(clusterID, opt) {
  //setLogger(opt);
  info("destroy cluster on aws:", clusterID);
  const accessKeyId = opt.id;
  const secretAccessKey = opt.pw;
  const instances = await awsListInstances(clusterID, opt);
  const region = getRegion(clusterID);
  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);
  const InstanceIds = instances.map((e)=>{
    return e.InstanceId;
  });
  if (InstanceIds.length > 0) {
    debug("destroy instances", InstanceIds);
    await ec2.terminateInstances({ InstanceIds }).promise();
    await waitForWrapper(ec2, "instanceTerminated", { InstanceIds });
  }
  const iam = createIAMObject(region, accessKeyId, secretAccessKey);
  await cleanUp(ec2, iam, clusterID);
  return true;
}


async function getInstances(ec2, Filters) {
  const result = await ec2.describeInstances({ Filters }).promise();
  const rt = result.Reservations
    .reduce((a, c)=>{
      return a.concat(c.Instances);
    }, []);

  let NextToken = result.NextToken;
  while (NextToken) {
    const result2 = await ec2.describeInstances({ Filters, NextToken }).promise();
    NextToken = result2.NextToken;
    Array.prototype.push.apply(rt, result2.Reservations
      .reduce((a, c)=>{
        return a.concat(c.Instances);
      }, []));
  }
  return rt;
}

async function getClusterInstances(clusterID, accessKeyId, secretAccessKey) {
  let region;
  try {
    region = getRegion(clusterID);
  } catch (err) {
    return getAllInstances(accessKeyId, secretAccessKey);
  }

  const ec2 = createEC2Object(region, accessKeyId, secretAccessKey);
  const Filters = [
    { Name: "instance-state-name", Values: ["pending", "running"] },
    { Name: "tag:abc4ClusterId", Values: [clusterID] }
  ];
  return getInstances(ec2, Filters);
}

/**
 * Return all instances which has abc4ClusterId tag.
 */
async function getAllInstances(accessKeyId, secretAccessKey) {
  const ec2 = createEC2Object(null, accessKeyId, secretAccessKey);
  const { Regions } = await ec2.describeRegions.promise();
  debug("regions:", Regions);
  const Filters = [{ Name: "tag-key", Values: ["abc4ClusterId"] }];
  const rt = await Regions.map((e)=>{
    ec2.endpoint = e.Endpoint;
    return getInstances(ec2, Filters);
  });
  return rt.reduce((acc, val)=>{
    return acc.concat(val);
  }, []);
}

/**
 * List up instances in the specified cluster.
 */
async function awsListInstances(clusterID, opt) {
  //setLogger(opt);
  debug("list up cluster on aws:", clusterID);
  const accessKeyId = opt.id;
  const secretAccessKey = opt.pw;

  const instances = await getClusterInstances(clusterID, accessKeyId, secretAccessKey);

  info(`${instances.length} node found`);
  debug(instances);
  return instances;
}

module.exports = {
  getImage,
  awsCreate,
  awsDestroy,
  awsListInstances
};
