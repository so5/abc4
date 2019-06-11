## Functions

<dl>
<dt><a href="#create">create(order)</a> ⇒ <code>Cluster</code></dt>
<dd><p>Create HPC cluster on cloud.</p>
</dd>
<dt><a href="#destroy">destroy(opt)</a> ⇒ <code>boolean</code></dt>
<dd><p>Destroy cluster which was created by create().</p>
</dd>
<dt><a href="#list">list(opt)</a> ⇒ <code>Object</code></dt>
<dd><p>Destroy cluster which was created by create().</p>
</dd>
<dt><a href="#increase">increase(opt)</a> ⇒ <code>boolean</code></dt>
<dd><p>Increase child node in the cluster.</p>
</dd>
<dt><a href="#decrease">decrease(opt)</a> ⇒ <code>boolean</code></dt>
<dd><p>Decrease child node in the cluster.</p>
</dd>
<dt><a href="#suspend">suspend(opt)</a> ⇒ <code>boolean</code></dt>
<dd><p>Suspend all nodes in the cluster.</p>
</dd>
<dt><a href="#resume">resume(opt)</a> ⇒ <code>boolean</code></dt>
<dd><p>Resume all nodes in the cluster.</p>
</dd>
</dl>

## Typedefs

<dl>
<dt><a href="#order">order</a> : <code>object</code></dt>
<dd></dd>
<dt><a href="#host">host</a> : <code>object</code></dt>
<dd></dd>
<dt><a href="#cluster">cluster</a> : <code>object</code></dt>
<dd></dd>
</dl>

<a name="create"></a>

## create(order) ⇒ <code>Cluster</code>
Create HPC cluster on cloud.

**Kind**: global function  
**Returns**: <code>Cluster</code> - - Cluster object which is just created.  

| Param | Type | Description |
| --- | --- | --- |
| order | <code>Order</code> | Order object for the cluster to build. |

<a name="destroy"></a>

## destroy(opt) ⇒ <code>boolean</code>
Destroy cluster which was created by create().

**Kind**: global function  
**Returns**: <code>boolean</code> - True if all instance is successfully destried.  

| Param | Type |
| --- | --- |
| opt | <code>Object</code> | 

<a name="list"></a>

## list(opt) ⇒ <code>Object</code>
Destroy cluster which was created by create().

**Kind**: global function  
**Returns**: <code>Object</code> - List of instances created by abc4.  

| Param | Type |
| --- | --- |
| opt | <code>Object</code> | 

<a name="increase"></a>

## increase(opt) ⇒ <code>boolean</code>
Increase child node in the cluster.

**Kind**: global function  
**Returns**: <code>boolean</code> - True if child node is successfully increased.  

| Param | Type |
| --- | --- |
| opt | <code>Object</code> | 

<a name="decrease"></a>

## decrease(opt) ⇒ <code>boolean</code>
Decrease child node in the cluster.

**Kind**: global function  
**Returns**: <code>boolean</code> - True if child node is successfully decreased.  

| Param | Type |
| --- | --- |
| opt | <code>Object</code> | 

<a name="suspend"></a>

## suspend(opt) ⇒ <code>boolean</code>
Suspend all nodes in the cluster.

**Kind**: global function  
**Returns**: <code>boolean</code> - True if all instance is successfully suspended.  

| Param | Type |
| --- | --- |
| opt | <code>Object</code> | 

<a name="resume"></a>

## resume(opt) ⇒ <code>boolean</code>
Resume all nodes in the cluster.

**Kind**: global function  
**Returns**: <code>boolean</code> - True if all instance is successfully resumed.  

| Param | Type |
| --- | --- |
| opt | <code>Object</code> | 

<a name="order"></a>

## order : <code>object</code>
**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| provider | <code>string</code> | cloud provider |
| numNodes | <code>number</code> | number of nodes |
| os | <code>string</code> | operating system |
| rootVolume | <code>number</code> | root storage volume in GB |
| shareStorage | <code>boolean</code> | if true, head node's storage is shared via NFSv4 |
| headOnlyParam | <code>object</code> | additional parameters only for head node. this value is passed to underlying cloud SDK(e.g. aws-sdk) |
| publicKey | <code>string</code> | public key which will be stored in head node |
| id | <code>string</code> | id for cloud provider (e.g. access key for AWS) |
| pw | <code>string</code> | pw for cloud provider (e.g. secret access key for AWS) |
| batch | <code>string</code> | batch system's name |
| runJobOnBatchServer | <code>boolean</code> | run jobs on batch server(head node) or not (default true) |
| batchSetupScript | <code>Array.&lt;string&gt;</code> | array of commands to be issued after batch server setup |
| packages | <code>Array.&lt;string&gt;</code> | array of package names to be installed |
| mpi | <code>string</code> | MPI library |
| compiler | <code>string</code> | compiler |
| playbook | <code>string</code> | playbook which will be run after cluster is up |
| debug | <code>function</code> | debug output function |
| info | <code>function</code> | info output function |

<a name="host"></a>

## host : <code>object</code>
**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| publicNetwork.hostname | <code>string</code> | hostname in public network |
| publicNetwork.IP | <code>string</code> | IP address in public network |
| privateNetwork.hostname | <code>string</code> | hostname in private network |
| privateNetwork.IP | <code>string</code> | IP address in private network |

<a name="cluster"></a>

## cluster : <code>object</code>
**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| user | <code>string</code> | username at head node |
| clusterID | <code>string</code> | unique string for cluster |
| privateKey | <code>string</code> | private key to login to head node. if publicKey is specified in order object, this property is undefined. |
| headNodes | [<code>Array.&lt;host&gt;</code>](#host) | ip, hostname of head node in public and private network. |
| childNodes | [<code>Array.&lt;host&gt;</code>](#host) | ip, hostname of child nodes in private network. |
| id | <code>string</code> | specified value in order |
| pw | <code>string</code> | specified value in order |

