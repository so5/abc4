"use strict";
//setup test framework
const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");
chai.use(require("sinon-chai"));
chai.use(require("chai-as-promised"));
chai.use(require("chai-json-schema-ajv"));

//testee
const { getImage, setupVPC, setupIAMRole, setupKeyPair, cleanUp } = require("../lib/providers/aws/internal.js");

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
  describe("#getImage", ()=>{
    const stub = sinon.stub();
    [
      { os: "centos7", ImageID: "ami-045f38c93733dd48d" },
      { os: "centos6", ImageID: "ami-02eb8e0986956e8d6" },
      { os: "ubuntu18", ImageID: "ami-0947690cc28849416" },
      { os: "ubuntu16", ImageID: "ami-0b86ca67cb64addcf" },
      { os: "rhel7", ImageID: "ami-00b95502a4d51a07e" },
      { os: "rhel6", ImageID: "ami-00436f752b63a5555" }
    ].forEach((e)=>{
      it(`should return latest lmage ID of ${e.os}`, async()=>{
        const image = await getImage(e.os, region, ec2);
        expect(image.ImageId, JSON.stringify(image, null, 2)).to.be.equal(e.ImageID);
      });
    });
    [
      "UBUNTU16",
      "UBUNTU18",
      "ubuntu 16",
      "ubuntu bionic",
      "CentOS7",
      "centos",
      "centos5",
      undefined, //eslint-disable-line no-undefined
      null,
      42,
      {},
      stub
    ].forEach((os)=>{
      it("should be rejected for invaild os keyword", ()=>{
        expect(getImage(os, "ap-northeast-1")).to.be.rejected;
        expect(stub).not.to.be.called;
      });
    });
    it("should be rejected if region is not specified", ()=>{
      expect(getImage("centos7")).to.be.rejected;
    });
  });
});
