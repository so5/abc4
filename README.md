[![npm version](https://badge.fury.io/js/abc4.svg)](https://badge.fury.io/js/abc4)
[![Build Status](https://travis-ci.org/so5/abc4.svg?branch=master)](https://travis-ci.org/so5/abc4)
[![Coverage Status](https://coveralls.io/repos/github/so5/abc4/badge.svg?branch=master)](https://coveralls.io/github/so5/abc4?branch=master)
[![Maintainability](https://api.codeclimate.com/v1/badges/908f9cdcd1d02ef90f06/maintainability)](https://codeclimate.com/github/so5/abc4/maintainability)
[![Inline docs](http://inch-ci.org/github/so5/abc4.svg?branch=master)](http://inch-ci.org/github/so5/abc4) 
[![Greenkeeper badge](https://badges.greenkeeper.io/so5/abc4.svg)](https://greenkeeper.io/)


# ABC4 (ABCCCC)
ABC4 means ABstruct Cloud hpC Cluster Controller.
you can create, suspend, resume, change number of nodes, and destroy HPC cluster on any cloud providers.


## HPC cluster which will be created
- one head node which can be accessed from internet
- any number of child nodes in private network
- host-based authentication is enabled between each node in private network
- ansible is installed to head node. you can customize the cluster with it
- head node's local sotrage is shared by all nodes via NFSv4

```
            +------ private network --------+
            |                 +-------+     |
 internet   |             +---| node0 |     |
            |             |   +-------+     |
          +-----------+   |   +-------+     |
          | head node |---|---| node1 |     |
          +-----------+   |   +-------+     |
            |             |   +-------+     |
            |             +---| node2 |     |
            |             .   +-------+     |
            |             .                 |
            |             .                 |
            |             .                 |
            +-------------------------------+
```

## How to use
### creat cluster

```
const {create} = require(abc4);
const order = {provider: "aws", region: "ap-northeast-1"};
const cluster = await create(order);
```

order is the option argument object. you can set any cluster setting (including provider specific one) with this object.
cluster is the object which has all information about the cluster you just creat (see also Cluster section)

### destroy cluster
```
const {destroy} = require(abc4);
await destroy (cluster.id);
```

cluster.id is returned string from create()

## supported providers
- aws
- azure (planning)
- GCE (planning)

## supported OS
- CentOS 7
- Ubuntu 18.04 LTS - Bionic (planning)
- Ubuntu 16.04 LTS - Xenial
- RedHat Enterprise Linux 7 (planning)


## API
please see separete [doc](./API.md)


## license
MIT
