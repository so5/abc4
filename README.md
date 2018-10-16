# ABCCCC
ABCCCC means ABstruct Cloud hpC Cluster Controller.
you can create, suspend, resume, change number of nodes, and destroy HPC cluster on any cloud providers.

## HPC cluster which will be created
- only one head node which can be accessed from internet
- any number of child nodes in private network
- ansible is installed on head node 
- host-based authentication is enabled between head node and child nodes
- head node's strage is shared by all nodes by NFSv4

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

## important notice
ABCCCC is alpha status. almost all functions are not implemented yet.

## supported providers
- aws (planned)
- azure (planned)
- GCE (planned)

## supported OS
- CentOS 7 (planned)
- CentOS 6 (planned)
- Ubuntu 18.04 LTS - Bionic (planned)
- Ubuntu 16.04 LTS - Xenial (planned)


## Functions

<dl>
<dt><a href="#create">create(order)</a> ⇒ <code>string</code></dt>
<dd><p>create HPC cluster on cloud</p>
</dd>
<dt><a href="#destroy">destroy(id)</a> ⇒ <code>boolean</code></dt>
<dd><p>destroy cluster which was created by create()</p>
</dd>
<dt><a href="#increase">increase(id, n)</a> ⇒ <code>boolean</code></dt>
<dd><p>increase child node in the cluster</p>
</dd>
<dt><a href="#decrease">decrease(id, n)</a> ⇒ <code>boolean</code></dt>
<dd><p>decrease child node in the cluster</p>
</dd>
<dt><a href="#suspend">suspend(id)</a> ⇒ <code>boolean</code></dt>
<dd><p>suspend all nodes in the cluster</p>
</dd>
<dt><a href="#resume">resume(id)</a> ⇒ <code>boolean</code></dt>
<dd><p>resume all nodes in the cluster</p>
</dd>
</dl>

<a name="create"></a>

## create(order) ⇒ <code>string</code>
create HPC cluster on cloud

**Kind**: global function  
**Returns**: <code>string</code> - id  

| Param | Type | Description |
| --- | --- | --- |
| order | <code>order</code> | order object for the cluster to build |

<a name="destroy"></a>

## destroy(id) ⇒ <code>boolean</code>
destroy cluster which was created by create()

**Kind**: global function  
**Returns**: <code>boolean</code> - true if all instance is successfully destried  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | id string which was returned from create() |

<a name="increase"></a>

## increase(id, n) ⇒ <code>boolean</code>
increase child node in the cluster

**Kind**: global function  
**Returns**: <code>boolean</code> - true if child node is successfully increased  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| id | <code>string</code> |  | id string which was returned from create() |
| n | <code>number</code> | <code>1</code> | how many nodes to be add |

<a name="decrease"></a>

## decrease(id, n) ⇒ <code>boolean</code>
decrease child node in the cluster

**Kind**: global function  
**Returns**: <code>boolean</code> - true if child node is successfully decreased

please note that if n is larger than number of existing child nodes,
head node is still working after decrease()  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| id | <code>string</code> |  | id string which was returned from create() |
| n | <code>number</code> | <code>1</code> | how many nodes to be decreased |

<a name="suspend"></a>

## suspend(id) ⇒ <code>boolean</code>
suspend all nodes in the cluster

**Kind**: global function  
**Returns**: <code>boolean</code> - true if all instance is successfully suspended  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | id string which was returned from create() |

<a name="resume"></a>

## resume(id) ⇒ <code>boolean</code>
resume all nodes in the cluster

**Kind**: global function  
**Returns**: <code>boolean</code> - true if all instance is successfully resumed  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | id string which was returned from create() |

