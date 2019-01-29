"use strict";
//setup test framework
const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");
chai.use(require("sinon-chai"));
chai.use(require("chai-as-promised"));

//helper function

//testee and test data
const { getImageId, awsCreate, awsDestroy, awsListInstances } = require("../lib/providers/aws");

describe("test for aws functions", function() {
  this.timeout(0);//eslint-disable-line no-invalid-this
  describe("#getImageId", async()=>{
    const stub = sinon.stub();
    [
      { os: "centos7", ImageID: "ami-8e8847f1" },
      { os: "centos6", ImageID: "ami-8374b8fc" },
      { os: "ubuntu18", ImageID: "ami-0f63c02167ca94956" },
      { os: "ubuntu16", ImageID: "ami-04afce36be5236d87" },
      { os: "rhel7", ImageID: "ami-08419d23bf91152e4" },
      { os: "rhel6", ImageID: "ami-00436f752b63a5555" }
    ].forEach((e)=>{
      it(`should return latest lmage ID of ${e.os}`, async()=>{
        expect(await getImageId(e.os, "ap-northeast-1")).to.be.equal(e.ImageID);
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
      it("should return null for invaild os keyword", async()=>{
        expect(getImageId(os, "ap-northeast-1")).to.be.rejected;
        expect(stub).not.to.be.called;
      });
    });
    it("should return null if region is not specified", async()=>{
      expect(getImageId("centos7")).to.be.rejected;
    });
  });
  describe("#create-list-destroy", async()=>{
    it("should create, list, and destroy", async()=>{
      const order = {
        provider: "aws",
        numNodes: 3,
        InstanceType: "t2.micro",
        os: "centos7",
        region: "ap-northeast-1"
      };
      const cluster = await awsCreate(order);
      expect(cluster.privateNetwork).to.have.lengthOf(order.numNodes);
      await awsDestroy(cluster.id);
      const instancesAfter = await awsListInstances(cluster.id);
      expect(instancesAfter.length).to.equal(0);
    });
  });
});
