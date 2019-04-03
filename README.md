[![Build Status](https://travis-ci.org/so5/abc4.svg?branch=master)](https://travis-ci.org/so5/abc4)
[![Maintainability](https://api.codeclimate.com/v1/badges/908f9cdcd1d02ef90f06/maintainability)](https://codeclimate.com/github/so5/abc4/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/908f9cdcd1d02ef90f06/test_coverage)](https://codeclimate.com/github/so5/abc4/test_coverage)

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

order is the option argument object. you can set any cluster setting (including provider specific one) with this one.
cluster is the object which has all information about the cluster you just creat (see also Cluster section)

### destroy cluster
```
const {destroy} = require(abc4);
await destroy (cluster.id);
```

cluster.id is returned string from create()

## supported providers
- aws
- azure (planned)
- GCE (planned)

## supported OS
- CentOS 7
- CentOS 6 (planned)
- Ubuntu 18.04 LTS - Bionic (planned)
- Ubuntu 16.04 LTS - Xenial
- RedHat Enterprise Linux 7 (planned)
- RedHat Enterprise Linux 6 (planned)


## API
please see separete doc


## license
MIT
