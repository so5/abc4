"use strict";
//setup test framework
const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");
chai.use(require("sinon-chai"));

//helper function

//testee and test data
const { getImageId, awsCreate, awsDestroy } = require("../lib/internal/aws.js");

describe.only("test for aws functions", function() {
  this.timeout(0);
  describe("#getAMPI_ID", async()=>{
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
      undefined,
      null,
      42,
      {},
      stub
    ].forEach((os)=>{
      it("should return null for invaild os keyword", async()=>{
        expect(await getImageId(os, "ap-northeast-1")).to.be.null;
        expect(stub).not.to.be.called;
      });
    });
    it("should return null if region is not specified", async()=>{
      expect(await getImageId("centos7")).to.be.null;
    });
  });
});
