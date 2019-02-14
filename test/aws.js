"use strict";
//setup test framework
const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");
chai.use(require("sinon-chai"));
chai.use(require("chai-as-promised"));
chai.use(require("chai-json-schema-ajv"));

//helper function
const fs = require("fs-extra");
const ARsshClient = require("arssh2-client");

//testee and test data
const { getImage, awsCreate, awsDestroy, awsListInstances } = require("../lib/providers/aws");

const addressSchema = {
  properties: {
    IP: { format: "ipv4" },
    hostname: { type: "string" }
  }
};

const clusterSchema = {
  properties: {
    childNodes: {
      type: "array",
      uniqueItems: true,
      items: {
        properties: {
          privateNetwork: addressSchema
        },
        required: ["privateNetwork"],
        additionalProperties: false
      }
    },
    headNodes: {
      type: "array",
      minItems: 1,
      maxItems: 1,
      items: {
        properties: {
          privateNetwork: addressSchema,
          publicNetwork: addressSchema
        },
        required: ["privateNetwork", "publicNetwork"],
        additionalProperties: false
      }
    },
    user: { type: "string" },
    privateKey: { type: "string" },
    id: { type: "string" }
  },
  required: ["childNodes", "headNodes", "loginUser", "privateKey", "id"],
  additionalProperties: false
};


describe("test for aws functions", function() {
  this.timeout(0);//eslint-disable-line no-invalid-this
  describe("#getImage", ()=>{
    const stub = sinon.stub();
    [
      { os: "centos7", ImageID: "ami-045f38c93733dd48d" },
      { os: "centos6", ImageID: "ami-02eb8e0986956e8d6" },
      { os: "ubuntu18", ImageID: "ami-0238fc6af6bba5241" },
      { os: "ubuntu16", ImageID: "ami-073bca96b05146436" },
      { os: "rhel7", ImageID: "ami-08419d23bf91152e4" },
      { os: "rhel6", ImageID: "ami-00436f752b63a5555" }
    ].forEach((e)=>{
      it(`should return latest lmage ID of ${e.os}`, async()=>{
        const image = await getImage(e.os, "ap-northeast-1");
        expect(image.ImageId).to.be.equal(e.ImageID);
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
  describe.only("#create-list-destroy", async()=>{
    it("should create, list, and destroy", async()=>{
      const order = {
        provider: "aws",
        numNodes: 3,
        InstanceType: "t2.micro",
        os: "ubuntu16",
        batch: "pbspro",
        region: "ap-northeast-1"
      };
      const cluster = await awsCreate(order);
      expect(cluster).to.be.jsonSchema(clusterSchema);
      expect(cluster.childNodes).to.have.lengthOf(order.numNodes - 1);
      const arssh = new ARsshClient({
        host: cluster.headNodes[0].publicNetwork.IP,
        username: cluster.user,
        privateKey: cluster.privateKey
      });

      //check ssh login setting
      const stdout = [];
      await arssh.exec("hostname", {}, stdout, stdout);

      for (const child of cluster.childNodes) {
        await arssh.exec(`ssh ${child.privateNetwork.IP} hostname`, stdout, stdout);
      }

      //check NFS
      await arssh.exec("echo #!/bin/bash\n\nhostname\n > run.sh && chmod +x run.sh");

      for (const child of cluster.childNodes) {
        await arssh.exec(`ssh ${child.privateNetwork.IP} cat run.sh`, stdout, stdout);
      }
      console.log("DEBUG 3", stdout);

      //check batch server
      await arssh.exec("for i in `seq 5`; do qsub run.sh; done", stdout, stdout);
      console.log("DEBUG 4", stdout);

      //await awsDestroy(cluster.id);
      const instancesAfter = await awsListInstances(cluster.id);
      expect(instancesAfter.length).to.equal(0);
    });
  });
});
