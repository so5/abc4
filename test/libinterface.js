"use strict";
//setup test framework
const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");
chai.use(require("sinon-chai"));

//stubs
const stubs = {
  create: sinon.stub(),
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
  return stubs(cmd);
});

//helper functions
const { reID } = require("../lib/validation/index.js");

//testee and test data
const { create, destroy, increase, decrease, suspend, resume } = require("../lib/index.js");
const testOrder = {
  provider: "test",
  n: 2
};

describe("test for library interface routines", ()=>{
  describe("#create", ()=>{
    it("should return uuid if called with right order", async()=>{
      expect(await create(testOrder)).to.match(reID);
    });
    it("should return null if called with illegal argument", async()=>{
      expect(await create("hoge")).to.be.null;
      expect(await create(null)).to.be.null;
      expect(await create(1)).to.be.null;
      expect(await create({})).to.be.null;
      expect(await create()).to.be.null;
    });
  });
  describe("#destroy", ()=>{
    let testClusterID;
    beforeEach(async()=>{
      testClusterID = await create(testOrder);
    });
    afterEach(async()=>{
      await destroy(testClusterID.id);
    });
    it("should return true if called with valid cluster id", async()=>{
      expect(await destroy(testClusterID.id)).to.be.true;
    });
    it("should return null if called with invalid cluster id", async()=>{
      expect(await destroy("hoge")).to.be.null;
      expect(await destroy(null)).to.be.null;
      expect(await destroy(1)).to.be.null;
      expect(await destroy({})).to.be.null;
      expect(await destroy()).to.be.null;
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
