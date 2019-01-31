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
  return methods[provider][cmd];
}

module.exports = {
  getMethod
};
