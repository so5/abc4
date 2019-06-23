"use strict";
//setup test framework
const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");
chai.use(require("sinon-chai"));
chai.use(require("chai-as-promised"));
chai.use(require("chai-json-schema-ajv"));

//testee
const { setupVPC, setupIAMRole, setupKeyPair, cleanUp } = require("../lib/providers/aws/internal.js");

//helper
const uuidv1 = require("uuid/v1");
const { createEC2Object, createIAMObject } = require("../lib/providers/aws/internal.js");

//data
const dummyClusterId = `abc4_test_${uuidv1()}`;
const region = "ap-northeast-1";
const ec2 = createEC2Object(region);
const iam = createIAMObject(region);

describe("test for aws internal functions", function() {
  this.timeout(30000); //eslint-disable-line no-invalid-this
  afterEach(async()=>{
    await cleanUp(ec2, iam, dummyClusterId);
  });
  describe("#setupKeyPair", ()=>{
    it("should crete new key pair", async()=>{
      await setupKeyPair(ec2, dummyClusterId);
    });
    it.skip("should store existing public key", async()=>{});
  });
  describe("#setupIAMRole", ()=>{
    it("should crete IAM role to hadle EC2", async()=>{
      await setupIAMRole(iam, dummyClusterId);
    });
  });
  describe("#setupVPC", ()=>{
    it("should create VPC, subnet and securityGroups", async()=>{
      const [subnetId, sgId] = await setupVPC(ec2, dummyClusterId);
      expect(subnetId).to.match(/subnet-.*/);
      expect(sgId).to.match(/sg-.*/);
    });
  });
});
