"use strict";
//setup test framework
const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");
chai.use(require("sinon-chai"));
chai.use(require("chai-as-promised"));
chai.use(require("chai-json-schema-ajv"));

//testee
const { setupVPC, setupIAMRole, setupKeyPair, cleanUp, getVPCSetting } = require("../lib/providers/aws/internal.js");

//helper
const uuidv1 = require("uuid/v1");
const { createEC2Object, createIAMObject, waitForWrapper } = require("../lib/providers/aws/internal.js");

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
      const rt = await waitForWrapper(ec2, "keyPairExists", { KeyNames: [dummyClusterId] });
      expect(rt.KeyPairs[0].KeyName).to.equal(dummyClusterId);
    });
    it("should store existing public key", async()=>{
      const dummyPublicKey = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDEvgW3SzhmhwcpsQpBDL2AFLfIY4Gqd8iEy6YsBuX5/XfiQtTiT/NFCMwCKSFUbBByoeygrnFaaGWpDLeV04eezr2KQQScT5gcPwMtX3Yu/MEVdt31yvBWZT3rxLvo46SE5eBO4j1G62dpvaA0eFVQYHaXWmOKK/a3VP/JETLcFXwOeGfFYpW7iFPWYZimHOYmwLno57o7S3mjfPEnrHzn9kDqUMCE3VJXY9IentpfYlMr0mBbg89sfzkq5Y6jnYoK+WQtdLJSyZ6DIHeYyctwBCIx1ksfMMC3OsDdITEQ74A4i6R29EvuvNtfrOV7POzgW6YI3Ug5smDMp7Az8/6R";
      await setupKeyPair(ec2, dummyClusterId, dummyPublicKey);
      const rt = await waitForWrapper(ec2, "keyPairExists", { KeyNames: [dummyClusterId] });
      expect(rt.KeyPairs[0].KeyName).to.equal(dummyClusterId);
    });
    it("should store existing public key(dummy string)", async()=>{
      return expect(setupKeyPair(ec2, dummyClusterId, "hoge")).to.be.rejectedWith("Key is not in valid OpenSSH public key format");
    });
  });
  describe("#setupVPC", ()=>{
    it("should create VPC, subnet and securityGroups", async()=>{
      const [subnetId, sgId] = await setupVPC(ec2, dummyClusterId);
      expect(subnetId).to.match(/subnet-.*/);
      expect(sgId).to.match(/sg-.*/);
    });
    it("should return specified strings as subnet id and security group id", async()=>{
      const [subnetId, sgId] = await getVPCSetting({ SubnetId: "hoge", SecurityGroupIds: "huga" }, ec2, dummyClusterId);
      expect(subnetId).to.equal("hoge");
      expect(sgId).to.be.an("array").that.includes("huga");
      expect(sgId).to.have.lengthOf(1);
    });
    it("should return specified string as subnet id and array of strings as security group id", async()=>{
      const [subnetId, sgId] = await getVPCSetting({ SubnetId: "hoge", SecurityGroupIds: ["foo", "bar", "baz"] }, ec2, dummyClusterId);
      expect(subnetId).to.equal("hoge");
      expect(sgId).to.be.an("array").that.have.members(["foo", "bar", "baz"]);
      expect(sgId).to.have.lengthOf(3);
    });
  });
  describe("#setupIAMRole", ()=>{
    it("should crete IAM role to hadle EC2", async()=>{
      await setupIAMRole(iam, dummyClusterId);
    });
  });
});
