"use strict";
//setup test framework
const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");
chai.use(require("sinon-chai"));
chai.use(require("chai-as-promised"));
chai.use(require("chai-json-schema-ajv"));

//testee
//this test is only for aws provider but use library's public interface to use default values of order
const { create, destroy, list } = require("../lib");
const { getImage } = require("../lib/providers/aws");

//stub
const output = sinon.stub();

//helper function
const ARsshClient = require("arssh2-client");

const addressSchema = {
  properties: {
    IP: { format: "ipv4" },
    hostname: { type: "string" }
  }
};

//privateKey is required only if order does not have publicKey
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
    clusterID: { type: "string" }
  },
  required: ["childNodes", "headNodes", "user", "clusterID"],
  additionalProperties: false
};

describe("test for aws dedicated functions", function() {
  this.timeout(4000);
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
        const image = await getImage(e.os, "ap-northeast-1");
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
  describe("just create instances", async function() {
    this.timeout(900000);//eslint-disable-line no-invalid-this
    let cluster;
    afterEach(async()=>{
      await destroy(cluster);
      const instancesAfter = await list(cluster);
      expect(instancesAfter.length).to.equal(0);
    });
    //TODO check with several order pattern
    const userPlaybook = `\
- hosts: all
  tasks:
    - command: "hostname"
      register: tmp
    - debug: var=tmp
`;
    const order = {
      provider: "aws",
      numNodes: 3,
      InstanceType: "t2.micro",
      os: "ubuntu16",
      batch: "PBSpro",
      region: "ap-northeast-1",
      playbook: userPlaybook
    };
    //order.info = console.log;
    //order.debug = console.log;

    if (!order.publicKey) {
      clusterSchema.required.push("privateKey");
    }

    it("should create cluster", async()=>{
      cluster = await create(order);
      expect(cluster).to.be.jsonSchema(clusterSchema);
      expect(cluster.childNodes).to.have.lengthOf(order.numNodes - 1);
      const arssh = new ARsshClient({
        host: cluster.headNodes[0].publicNetwork.IP,
        username: cluster.user,
        privateKey: cluster.privateKey
      });

      //check ssh login setting
      output.reset();
      await arssh.exec("hostname", {}, output, output);
      expect(output).to.be.calledOnce;
      const headDnsName = cluster.headNodes[0].privateNetwork.hostname;
      const firstPiriod = headDnsName.indexOf(".");
      const headnode = headDnsName.slice(0, firstPiriod);
      expect(output).to.be.always.calledWithMatch(headnode);

      output.reset();

      for (const child of cluster.childNodes) {
        await arssh.exec(`ssh ${child.privateNetwork.IP} hostname`, {}, output, output);
      }
      expect(output).to.be.callCount(cluster.childNodes.length);


      //wait for finish cloud-init
      await arssh.exec("cloud-init status -w");
      //console.log("cloud-init done!");

      //check NFS
      output.reset();
      await arssh.exec("echo sleep 2 && hostname > run.sh && chmod +x run.sh");

      for (const child of cluster.childNodes) {
        await arssh.exec(`ssh ${child.privateNetwork.IP} ls run.sh`, {}, output, output);
      }
      expect(output).to.be.callCount(cluster.childNodes.length);
      expect(output).to.be.always.calledWithMatch("run.sh");

      //check batch server
      output.reset();
      await arssh.exec("for i in `seq 5`; do qsub run.sh; done", {}, output, output);
      expect(output).to.be.callCount(5);
      expect(output).to.be.always.calledWithMatch(headnode);
      //TODO check run.sh.[oe]0 〜 run.sh.[oe]4
      output.reset();
      await arssh.exec("cat run.sh.o*", {}, console.log, console.log);
      await arssh.exec("cat run.sh.e*", {}, console.log, console.log);
      await arssh.exec("ls -l run.sh.*", {}, console.log, console.log);
    });
  });
});
