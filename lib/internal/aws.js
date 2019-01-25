"use strict";
const debug = require("debug")("abc4:aws");
const debugAWS = require("debug")("abc4:aws-sdk");
const AWS = require("aws-sdk");
AWS.config.update({ logger: { log: debugAWS } });
const {OSFilters, defaultFilter} = require("./awsQueryFilters");

/**
 * get latest AMI ID of official image on AWS market place
 * @param {string} os - os name in all lower case
 * @returns {string} - ImageID
 */
async function getImageId(os, region) {
  if(typeof region !== "string"){
    debug("invalid region specified", region);
    return null;
  }
  const osFilter = OSFilters[os];
  if(! osFilter){
    debug("invalid os specified", os);
    return null;
  }
  debug("search AMI ID for ", os, "in", region);
  const queryFilter = defaultFilter.concat(osFilter);
  const params = {
    ExecutableUsers: ["self", "all"],
    Filters: queryFilter
  };
  const ec2 = new AWS.EC2({ region });
  const rt = await ec2.describeImages(params).promise();
  if (rt.Images.length === 0) {
    return null;
  }
  debug("Candidates:\n",rt.Images.map((e)=>{
    return {date: e.CreationDate, ID: e.ImageId}
  }));
  const latest = rt.Images
    .filter((e)=>{
      return e.CreationDate;
    })
    .reduce((a, c)=>{
      return c.CreationDate > a.CreationDate ? c : a;
    });
  debug("latest image: ", latest);
  return latest.ImageId;
}

/**
 * create cluster on AWS
 */
async function awsCreate(order) {
  debug("create cluster on aws:", order);
  const os = order.os.toLowerCase();
  const numberOfNodes = order.n;
  const awsConfig = {
    region: order.region
  };
  //if id and pw is not supplied, it will read from shared credentials file or environment variables when running in Node.js
  if (order.hasOwnProperty("id")) {
    awsConfig.accessKeyId = order.id;
  }
  if (order.hasOwnProperty("pw")) {
    awsConfig.secretAcessKey = order.pw;
  }

  try {
    const ami = await getImageId(os);
    const ec2 = new AWS.EC2(awsConfig);
    //TODO write following
  } catch (e) {
    debug("fatal error occurred");
    throw e;
  } finally {
    debug("clear region, accessKeyId, and secretAccessKey from AWS config");
  }
}

/**
 * destroy cluster on AWS
 */
async function awsDestroy(id) {}

module.exports = {
  getImageId,
  awsCreate,
  awsDestroy
};
