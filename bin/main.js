#!/usr/bin/env node
"use strct";
Error.stackTraceLimit=0;

const fs = require("fs");
const path = require("path");
const { docopt } = require("docopt");
const lib = require("../lib/index");

const doc = `
Usage:
  abc4 create <order>
  abc4 destroy <id_string>
  abc4 list [<id_string>]

order is JSON filename or JSON string
`;


/**
 * main function
 */
async function main() {
  const options = docopt(doc);
  if (options.create) {
    let strOrder;
    try {
      strOrder = fs.readFileSync(path.resolve(process.cwd(), options["<order>"])).toString();
    } catch (e) {
      if (e.code !== "ENOENT") {
        throw e;
      }
      strOrder = options["<order>"];
    }
    let order;
    try {
      order = JSON.parse(strOrder);
    } catch (e) {
      if (!(e instanceof SyntaxError)) {
        throw e;
      }
      console.log("invalid order");
      return;
    }
    const rt = await lib.create(order);

    console.log("create cluster done:");
    console.log("how to login to head node");
    rt.headNodes.forEach((e)=>{
      console.log(`  ssh ${rt.loginUser}@${e.publicNetwork.IP}`);
    });
    console.log("cluster id:");
    console.log(`  ${rt.id}`)

    console.log("network configuration:");
    console.log("head node:");
    console.log("  public network:");
    rt.headNodes.forEach((e)=>{
      console.log(`    - ${e.publicNetwork.hostname} ( ${e.publicNetwork.IP} )`);
    });
    console.log("  private network:");
    rt.headNodes.forEach((e)=>{
      console.log(`    - ${e.privateNetwork.hostname} ( ${e.privateNetwork.IP} )`);
    });
    console.log("child node:");
    console.log("  private network:");
    rt.childNodes.forEach((e)=>{
      console.log(`    - ${e.privateNetwork.hostname} ( ${e.privateNetwork.IP} )`);
    });

  } else if (options.destroy) {
    await lib.destroy(options["<id_string>"]);
  } else if (options.list) {
    const id = options["<id_string>"] || null;
    await lib.list(id !== "all" ? id : null);
  }
}

main().catch((e)=>{
  console.log("fatal error occurred", e);
});
