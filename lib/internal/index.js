"use strict";
const { awsCreate, awsDestroy } = require("./aws");
const methods = {
  test: {
    create: ()=>{},
    destroy: ()=>{
      return true;
    },
    list: ()=>{
      return true;
    },
    increase: ()=>{
      return true;
    },
    decrease: ()=>{
      return true;
    },
    suspend: ()=>{
      return true;
    },
    resume: ()=>{
      return true;
    }
  },
  aws: {
    create: awsCreate,
    destroy: awsDestroy,
    list: ()=>{},
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
