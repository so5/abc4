"use strict";
//setup test framework
const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");
chai.use(require("sinon-chai"));

//stubs
const uuidv1 = require("uuid/v1");
const stubs = {
  create: async()=>{
    return { clusterID: `abc4_aws_foo_bar_${uuidv1()}` };
  },
  destroy: sinon.stub(),
  list: sinon.stub(),
  increase: sinon.stub(),
  decrease: sinon.stub(),
  suspend: sinon.stub(),
  resume: sinon.stub()
};

const rewire = require("rewire");
const index = rewire("../lib/index.js");
//eslint-disable-next no-underscore-dangle
index.__set__("getMethod", (provider, cmd)=>{
  return stubs[cmd];
});

//helper functions
const { reID } = require("../lib/validation/index.js");

//testee and test data
const create = index.__get__("create");
const destroy = index.__get__("destroy ");
const increase = index.__get__("increase");
const decrease = index.__get__("decrease");
const suspend = index.__get__("suspend ");
const resume = index.__get__("resume ");
const testOrder = {
  provider: "aws",
  region: "hoge"
};

describe("test for library interface routines", ()=>{
  describe("#create", ()=>{
    it("should return ID if called with right order", async()=>{
      const { clusterID } = await create(testOrder);
      expect(clusterID).to.match(reID);
    });
    [
      "hoge",
      null,
      1,
      {},
      undefined
    ].forEach((arg)=>{
      it("should be rejected if called with illegal argument", ()=>{
        return expect(create(arg)).eventually.to.be.rejected;
      });
    });
  });
  describe("#destroy", ()=>{
    let testCluster;
    beforeEach(async()=>{
      testCluster = await create(testOrder);
    });
    it("should return true if called with valid cluster object", async()=>{
      expect(await destroy(testCluster)).to.be.true;
    });
    [
      "hoge",
      null,
      1,
      {},
      undefined
    ].forEach((arg)=>{
      it("should be rejected if called with invalid cluster object", async()=>{
        expect(destroy(arg)).eventually.to.be.rejected;
      });
    });
  });
  describe.skip("#increase", ()=>{
  });
  describe.skip("#decrease", ()=>{
  });
  describe.skip("#suspend", ()=>{
  });
  describe.skip("#resume", ()=>{
  });
});
