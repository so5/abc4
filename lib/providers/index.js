"use strict";
const { create, destroy, list, increase, decrease, suspend, resume } = require("./test");
const { awsCreate, awsDestroy, awsListInstances } = require("./aws");
const methods = {
  test: { create, destroy, list, increase, decrease, suspend, resume },
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
