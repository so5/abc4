"use strict";
//setup test framework
const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");
chai.use(require("sinon-chai"));
chai.use(require("chai-as-promised"));
chai.use(require("chai-json-schema-ajv"));

//testee
const { create, destroy, list } = require("../lib");

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

//privateKey is not mandatory porp if order has publicKey
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


describe("create and destroy cluster", async function() {
  this.timeout(900000); //eslint-disable-line no-invalid-this
  let cluster;
  afterEach(async()=>{
    await destroy(cluster);
    const instancesAfter = await list(cluster);
    expect(instancesAfter.length).to.equal(0);
  });
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
    InstanceType: "t2.nano",
    os: "ubuntu16",
    batch: "PBSpro",
    region: "ap-northeast-1",
    playbook: userPlaybook
  };

  if (!order.publicKey) {
    clusterSchema.required.push("privateKey");
  }

  it.only("should create cluster", async()=>{
    cluster = await create(order);
    expect(cluster).to.be.jsonSchema(clusterSchema);
    expect(cluster.childNodes).to.have.lengthOf(order.numNodes - 1);
    const arssh = new ARsshClient({
      host: cluster.headNodes[0].publicNetwork.IP,
      username: cluster.user,
      privateKey: cluster.privateKey,
      maxConnection: 1
    });

    //check ssh login setting
    output.reset();
    await arssh.exec("hostname", {}, output, output);
    expect(output).to.be.calledOnce;
    const headDnsName = cluster.headNodes[0].privateNetwork.hostname;
    const firstPiriod = headDnsName.indexOf(".");
    const headnode = headDnsName.slice(0, firstPiriod);
    expect(output).to.be.always.calledWithMatch(headnode);

    //wait for finish cloud-init
    await arssh.watch("tail /var/log/cloud-init-output.log >&2 && cloud-init status", { out: /done|error|disabled/ }, 60000, 20, {});

    await arssh.exec("sudo cat /var/log/cloud-init-output.log", {}, console.log, console.log); //for debug
    await arssh.exec("sudo head /etc/ssh/sshd_config", {}, console.log, console.log); //for debug
    await arssh.exec("sudo cat /etc/ssh/shosts.equiv", {}, console.log, console.log); //for debug
    await arssh.exec("pbsnodes -a", {}, console.log, console.log); //for debug
    //await arssh.exec("sudo cat /var/lib/cloud/instance/scripts/runcmd", {}, console.log, console.log); //for debug

    //check ssh login from head node to child nodes
    for (const child of cluster.childNodes) {
      output.reset();
      await arssh.exec(`ssh ${child.privateNetwork.IP} hostname`, {}, output, output);
      const hostname = child.privateNetwork.hostname.split(".")[0];
      expect(output).to.be.calledWithMatch(hostname);
      await arssh.exec(`ssh ${child.privateNetwork.IP} cat /etc/pbs.conf`, {}, console.log, console.log); //for debug
      await arssh.exec(`sudo ssh ${child.privateNetwork.IP} head /etc/ssh/sshd_config`, {}, console.log, console.log); //for debug
    }

    //check NFS
    output.reset();
    await arssh.exec("echo 'sleep 2 && hostname' > run.sh && chmod +x run.sh");

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
    //wait to finish all job
    await arssh.exec("qstat && sleep 15&&qstat");

    output.reset();
    await arssh.exec("cat run.sh.o*|sort|uniq", {}, output, output);
    expect(output).to.be.callCount(1);
    console.log(output.getCall(0).args);
    expect(output).to.be.always.calledWithMatch(headnode);

    for (const child of cluster.childNodes) {
      const dnsName = child.privateNetwork.hostname;
      const firstPiriod2 = dnsName.indexOf(".");
      const childNode = dnsName.slice(0, firstPiriod2);
      expect(output).to.be.always.calledWithMatch(childNode);
    }
  });
});
