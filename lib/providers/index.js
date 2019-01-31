"use strict";
const { awsCreate, awsDestroy, awsListInstances } = require("./aws");
const methods = {
  aws: {
    create: awsCreate,
    destroy: awsDestroy,
    list: awsListInstances,
    increase: ()=>{},
    decrease: ()=>{},
    suspend: ()=>{},
    resume: ()=>{}
  }
};


function getMethod(provider, cmd) {
  const method = methods[provider][cmd];
  if (typeof method !== "function") {
    const err = new Error("Method not found");
    err.message = `can not found ${cmd} method for ${provider}`;
    err.provider = provider;
    err.cmd = cmd;
    throw err;
  }
  return method;
}

module.exports = {
  getMethod
};
