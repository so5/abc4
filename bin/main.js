#!/usr/bin/env node
"use strct";
const fs = require("fs");
const path = require("path");
const { docopt } = require("docopt");
const lib = require("../lib/index");

const doc = `
Usage:
  abc4 create <order_file>
  abc4 destroy <id_string>
  abc4 list [<id_string>]
`;


/**
 * main function
 */
async function main() {
  const options = docopt(doc);
  if (options.create) {
    const filename = path.resolve(process.cwd(), options["<order_file>"]);
    const strOrder = fs.readFileSync(filename).toString();
    const order = JSON.parse(strOrder);
    await lib.create(order);
  } else if (options.destroy) {
    await lib.destroy(options["<id_string>"]);
  } else if (options.list) {
    const id = options["<id_string>"] || null;
    await lib.list(id);
  }
}

main();
