"use strict";
const debugLib = require("debug");
const info = debugLib("abc4:info");
const debug = debugLib("abc4:aws");
const sdklog = debugLib("abc4:aws-sdk");
const AWS = require("aws-sdk");
AWS.config.update({ logger: { log: sdklog } });

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

async function getVPCSetting(opt, ec2, clusterID) {
  //create new VPC
  if (!opt.hasOwnProperty("SubnetId") || !opt.hasOwnProperty("SecurityGroupIds")) {
    return setupVPC(ec2, clusterID);
  }
  info("use specified subnet and security group");

  if (typeof opt.SubnetId !== "string") {
    return Promise.reject(new Error("SubnetId must be string"));
  }
  if (Array.isArray(opt.SecurityGroupIds)) {
    if (opt.SecurityGroupIds.some((e)=>{
      return typeof e !== "string";
    })) {
      return Promise.reject(new Error("all SecurityGroupIds member must be string"));
    }
  }
  const sg = typeof opt.SecurityGroupIds === "string" ? [opt.SecurityGroupIds] : opt.SecurityGroupIds;
  debug("SubnetID:", opt.SubnetId);
  debug("SecurityGroupIds:", sg);
  return [opt.SubnetId, sg];
}

function getUserName(os) {
  if (os.startsWith("centos")) {
    return "centos";
  }
  if (os.startsWith("ubuntu")) {
    return "ubuntu";
  }
  return "ec2-user";
}
function getGroupName(os) {
  //fall-back to username
  return getUserName(os);
}

async function setupKeyPair(ec2, KeyName, PublicKeyMaterial) {
  if (PublicKeyMaterial) {
    info("import public key");
    await ec2.importKeyPair({ KeyName, PublicKeyMaterial }).promise();
    debug("import public key done");
    return Promise.resolve();
  }
  info("create key pair");
  const keyPair = await ec2.createKeyPair({ KeyName }).promise();
  debug("create key pair done");
  return keyPair.KeyMaterial;
}

/**
 * Create IAM role and instanceProfile.
 * @param {Object} iam - AWS.IAM instance.
 * @param {string} clusterID - Id string returned by AWScreate.
 * @returns {string} - Arn of created instanceProfile.
 */
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
  debug("createRole done");
  await iam.attachRolePolicy({ RoleName, PolicyArn: "arn:aws:iam::aws:policy/AmazonEC2FullAccess" }).promise();
  await iam.attachRolePolicy({ RoleName, PolicyArn: "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM" }).promise();
  debug("attachRolePolicy done");
  const rt = await iam.createInstanceProfile({ InstanceProfileName: RoleName }).promise();
  debug("createInstanceProfile done");
  await iam.addRoleToInstanceProfile({ InstanceProfileName: RoleName, RoleName }).promise();
  info("create IAM role done");
  return rt.Arn;
}

/**
 * Create VPC and security group which allow inbound ssh access.
 * @param {Object} ec2 - AWS.EC2 instance.
 * @param {string} clusterID - Id string returned by AWScreate.
 * @returns {string, string} SubnetId, groupId - subnet and security group id respectively.
 */
async function setupVPC(ec2, clusterID) {
  info("create VPC");
  const { Vpc } = await ec2.createVpc({ CidrBlock: "10.0.0.0/16" }).promise();
  const VpcId = Vpc.VpcId;
  await ec2.modifyVpcAttribute({ EnableDnsHostnames: { Value: true }, VpcId }).promise();
  await ec2.createTags({
    Resources: [VpcId],
    Tags: [{ Key: "abc4ClusterId", Value: clusterID }]
  }).promise();
  debug("create VPC done", VpcId);

  const { Subnet } = await ec2.createSubnet({ CidrBlock: "10.0.0.0/16", VpcId }).promise();
  const SubnetId = Subnet.SubnetId;
  await ec2.createTags({
    Resources: [SubnetId],
    Tags: [{ Key: "abc4ClusterId", Value: clusterID }]
  }).promise();

  await ec2.modifySubnetAttribute({
    MapPublicIpOnLaunch: { Value: true },
    SubnetId
  }).promise();
  await ec2.modifySubnetAttribute({
    AssignIpv6AddressOnCreation: { Value: false },
    SubnetId
  }).promise();
  const { InternetGateway } = await ec2.createInternetGateway().promise();
  const InternetGatewayId = InternetGateway.InternetGatewayId;
  await ec2.createTags({
    Resources: [InternetGatewayId],
    Tags: [{ Key: "abc4ClusterId", Value: clusterID }]
  }).promise();
  debug("create IGW done", InternetGateway);
  await ec2.attachInternetGateway({ InternetGatewayId, VpcId }).promise();
  debug("attach IGW done", InternetGateway);
  const { RouteTables } = await ec2.describeRouteTables({
    Filters: [{ Name: "vpc-id", Values: [VpcId] }, { Name: "association.main", Values: ["true"] }]
  }).promise();
  const { RouteTableId } = RouteTables[0];
  debug("main route table id=", RouteTableId);
  await ec2.createTags({
    Resources: [RouteTableId],
    Tags: [{ Key: "abc4ClusterId", Value: clusterID }]
  }).promise();
  await ec2.createRoute({
    DestinationCidrBlock: "0.0.0.0/0",
    GatewayId: InternetGatewayId,
    RouteTableId
  }).promise();
  debug("add default route to IGW done", RouteTableId);
  debug("create Subnet done", SubnetId);
  const { SecurityGroups } = await ec2.describeSecurityGroups({ Filters: [{ Name: "vpc-id", Values: [VpcId] }] }).promise();
  const defaultGroupId = SecurityGroups[0].GroupId;

  const { GroupId } = await ec2.createSecurityGroup({ VpcId, Description: "allow ssh access", GroupName: `${clusterID}-head` }).promise();
  await ec2.createTags({
    Resources: [GroupId],
    Tags: [{ Key: "abc4ClusterId", Value: clusterID }]
  }).promise();
  await ec2.authorizeSecurityGroupIngress({
    GroupId,
    IpPermissions: [
      {
        UserIdGroupPairs: [
          {
            Description: "default",
            GroupId: defaultGroupId
          }
        ],
        IpProtocol: "-1"
      },
      {
        IpRanges: [
          {
            CidrIp: "0.0.0.0/0",
            Description: "from all over the world"
          }
        ],
        FromPort: 22,
        ToPort: 22,
        IpProtocol: "tcp"
      }
    ]
  }).promise();
  await ec2.authorizeSecurityGroupIngress({
    GroupId: defaultGroupId,
    IpPermissions: [
      {
        UserIdGroupPairs: [
          {
            Description: "head node",
            GroupId
          }
        ],
        IpProtocol: "-1"
      }
    ]
  }).promise();
  debug("create Security Group done", GroupId);
  return [SubnetId, [GroupId]];
}

/**
 * Cleanup all resources except for instances.
 * @param {Object} ec2 - AWS.EC2 instance.
 * @param {Object} iam - AWS.IAM instance.
 * @param {string} clusterID - Id string returned by AWScreate.
 */
async function cleanUp(ec2, iam, clusterID) {
  const Filters = [{ Name: "tag:abc4ClusterId", Values: [clusterID] }];
  const p = [];
  const p2 = [];

  const { SecurityGroups } = await ec2.describeSecurityGroups({ Filters }).promise();
  for (const sg of SecurityGroups) {
    info("remove security group", sg.GroupId);
    const defaultGroupId = sg.IpPermissions.map((e)=>{
      return e.UserIdGroupPairs;
    })[0][0].GroupId;
    p2.push(
      ec2.revokeSecurityGroupIngress({
        GroupId: defaultGroupId,
        IpPermissions: [
          {
            UserIdGroupPairs: [
              {
                GroupId: sg.GroupId
              }
            ],
            IpProtocol: "-1"
          }
        ]
      })
        .promise()
        .then(()=>{
          return ec2.deleteSecurityGroup({ GroupId: sg.GroupId }).promise();
        })
    );
  }

  const { InternetGateways } = await ec2.describeInternetGateways({ Filters }).promise();
  for (const e of InternetGateways) {
    info("remove Internet Gateway", e.InternetGatewayId);
    const pDetach = [];
    for (const attachement of e.Attachments) {
      pDetach.push(ec2.detachInternetGateway({ InternetGatewayId: e.InternetGatewayId, VpcId: attachement.VpcId }).promise());
    }
    p2.push(Promise.all(pDetach)
      .then(()=>{
        return ec2.deleteInternetGateway({ InternetGatewayId: e.InternetGatewayId }).promise();
      }));
  }

  const { Subnets } = await ec2.describeSubnets({ Filters }).promise();
  for (const e of Subnets) {
    info("remove Subnet", e.SubnetId);
    p2.push(ec2.deleteSubnet({ SubnetId: e.SubnetId }).promise());
  }
  await Promise.all(p2);

  const { Vpcs } = await ec2.describeVpcs({ Filters }).promise();
  for (const e of Vpcs) {
    info("remove Vpc", e.VpcId);
    p.push(ec2.deleteVpc({ VpcId: e.VpcId }).promise());
  }
  p.push(cleanUpKeyPair(ec2, clusterID));
  p.push(cleanUpIAMRole(iam, clusterID));
  await Promise.all(p);
  info("cleanUp done");
}

async function cleanUpKeyPair(ec2, clusterID) {
  const rt = await ec2.describeKeyPairs({ KeyNames: [clusterID] })
    .promise()
    .catch((err)=>{
      if (err.code === "InvalidKeyPair.NotFound") {
        info("key pair not found");
      } else {
        debug(err);
        throw err;
      }
    });
  if (typeof rt === "undefined") {
    return;
  }
  const p = [];
  for (const e of rt.KeyPairs) {
    const KeyName = e.KeyName;
    p.push(ec2.deleteKeyPair({ KeyName }).promise());
  }
  await Promise.all(p);
}

async function cleanUpIAMRole(iam, clusterID) {
  info("remove IAM role");
  const rt = await iam.listInstanceProfilesForRole({ RoleName: clusterID })
    .promise()
    .catch((err)=>{
      if (err.code === "NoSuchEntity") {
        info("instance profile not found");
      } else {
        debug(err);
        throw err;
      }
    });
  if (typeof rt === "undefined") {
    return;
  }
  await Promise.all(rt.InstanceProfiles.map(async(e)=>{
    const InstanceProfileName = e.InstanceProfileName;
    await iam.removeRoleFromInstanceProfile({ InstanceProfileName, RoleName: clusterID }).promise();
    await iam.deleteInstanceProfile({ InstanceProfileName }).promise();
    return Promise.all(e.Roles.map(async(role)=>{
      const RoleName = role.RoleName;
      await iam.detachRolePolicy({ RoleName, PolicyArn: "arn:aws:iam::aws:policy/AmazonEC2FullAccess" }).promise();
      await iam.detachRolePolicy({ RoleName, PolicyArn: "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM" }).promise();
      return iam.deleteRole({ RoleName }).promise();
    }));
  }));
}

function createConfig(region, accessKeyId, secretAccessKey) {
  const awsConfig = {};
  if (typeof region === "string") {
    awsConfig.region = region;
  }
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

module.exports = {
  waitForWrapper,
  setupKeyPair,
  setupIAMRole,
  setupVPC,
  cleanUp,
  cleanUpIAMRole,
  cleanUpKeyPair,
  createEC2Object,
  createIAMObject,
  getUserName,
  getGroupName,
  getVPCSetting
};
