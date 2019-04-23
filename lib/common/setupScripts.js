"use strict";
const { getPlaybook, getPlaybookNames, getRoleNames, getHostbasedAuthPlaybook } = require("./playbook");

//private functions
/*eslint-disable valid-jsdoc,require-jsdoc */
function isSystemd(os) {
  if (/(centos|rhel)6/i.test(os)) {
    return false;
  }
  return true;
}

function getSshKeySignPath(os) {
  if (/^ubuntu/i.test(os)) {
    return "/usr/lib/openssh/ssh-keysign";
  }
  return "/usr/libexec/openssh/ssh-keysign";
}

function chown(owner, group, path) {
  return `chown ${owner}:${group} ${path}`;
}

function chmod(mode, path) {
  return `chmod ${mode} ${path}`;
}

function getSshdConf(isChild = false) {
  const sshdConfOnlyForChild = `\
PubkeyAuthentication no
AuthenticationMethods hostbased
`;
  const sshdConf = `\
HostbasedAuthentication yes
PermitRootLogin prohibit-password
IgnoreRhosts no
Port 22
Protocol 2
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_dsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
HostKey /etc/ssh/ssh_host_ed25519_key
UsePrivilegeSeparation yes
KeyRegenerationInterval 3600
ServerKeyBits 1024
SyslogFacility AUTH
LogLevel INFO
LoginGraceTime 120
StrictModes yes
RSAAuthentication yes
PubkeyAuthentication yes
RhostsRSAAuthentication no
PermitEmptyPasswords no
ChallengeResponseAuthentication no
PasswordAuthentication no
X11Forwarding yes
X11DisplayOffset 10
PrintMotd no
PrintLastLog yes
TCPKeepAlive yes
AcceptEnv LANG LC_*
Subsystem sftp /usr/lib/openssh/sftp-server
UsePAM yes
`;
  return isChild ? sshdConf + sshdConfOnlyForChild : sshdConf;
}

function getSshConf() {
  return `\
HostBasedAuthentication yes
EnableSSHKeysign yes
NoHostAuthenticationForLocalhost yes
Host *
    SendEnv LANG LC_*
    HashKnownHosts yes
    GSSAPIAuthentication yes
    GSSAPIDelegateCredentials no
`;
}

/**
 * Return shell script to change owner, group and permission.
 * @param {string} path - Filepath to be changed.
 * @param {string} owner - Owner name.
 * @param {string} group - Group name.
 * @param {string} mode - Permission mode (e.g. 744, ug=rwx).
 * @returns {string} - Shell script content.
 */
function changePermission(path, owner, group, mode) {
  return `${chown(owner, group, path)} && ${chmod(mode, path)}`;
}

/**
 * Return shell script which call ssh-keyscan over hostnames on specified hostList file.
 * @param {string} hostList - Filename of hostList.
 * @param {string} knownHosts - Result filename.
 * @param {string} owner - Owner name of knowHosts.
 * @param {string} group - Group name of knowHosts.
 * @param {string} mode - Permission mode of knowHosts (e.g. 744, ug=rwx).
 * @returns {string} - Shell script content.
 */
function keyScan(hostList, knownHosts, owner, group, mode) {
  let rt = `\
for i in \`cat ${hostList}\`;do
  ssh-keyscan $i >> ${knownHosts}
done
`;
  rt += changePermission(knownHosts, owner, group, mode);
  return rt;
}

/**
 * Return shell script to install ansible
 *   https://docs.ansible.com/ansible/latest/installation_guide/intro_installation.html#latest-release-via-dnf-or-yum.
 */
function installAnsible(os) {
  let rt;
  if (os.startsWith("ubuntu")) {
    rt = `\
sudo apt-get update
sudo apt-get install software-properties-common
sudo apt-add-repository --yes --update ppa:ansible/ansible
sudo apt-get -y  install ansible python-dnspython`;
  } else if (/(?:centos|rhel)7/.test(os)) {
    rt = `\
echo sudo subscription-manager repos --enable rhel-7-server-ansible-2.6-rpms
echo sudo yum -y install ansible python2-dns
`;
  } else {
    rt = `\
echo "fall-back to pip"
echo sudo pip install ansible dnspython
`;
  }
  return rt;
}


function pullRolesFromGalaxy(opt) {
  const roles = getRoleNames(opt);
  return roles.length > 0 ? `ansible-galaxy install -p/etc/ansible/roles ${roles.join(" ")}` : "echo no roles on ansible-galaxy needed";
}

function runPlaybooks(opt) {
  const user = opt.user;
  const playbookDir = opt.playbookDir;
  const userPlaybook = opt.playbook;

  const playbooks = getPlaybookNames(opt);
  if (userPlaybook) {
    playbooks.push("userPlaybook");
  }
  if (playbooks.length === 0) {
    return "echo nothing to play at this time";
  }
  return `sudo -i -u ${user} ansible-playbook -f 1 --ssh-common-args="-oControlMaster=auto -oControlPath=/tmp/ -oControlPersist=60m -oPreferredAuthentications=hostbased"\
    --timeout=3600 ${playbooks.map((e)=>{
    return `${playbookDir}/${e}.yml`;
  }).join(" ")}`;
}

//public functions
/*eslint-enable valid-jsdoc require-jsdoc*/
/**
 *
 * @param {Object} opt - Option argument.
 * @param {string} opt.inventory - Absolute path of inventory file.
 * @param {string} opt.shostsEquiv - Absolute path of shosts.equiv file.
 * @param {string[]} opt.makeShostsEquiv - Scripts to make shosts.equiv file.
 * @param {string[]} opt.packages - Package names to be installed.
 */
function getUserData(opt, isChild) {
  opt.inventory = opt.inventory || "/etc/ansible/hosts"; //ansible's defalut path
  opt.config = opt.config || "/etc/ansible/ansible.cfg"; //ansible's defalut path
  opt.shostsEquiv = opt.shostsEquiv || "/etc/ssh/shosts.equiv"; //default for ubuntu
  //following filenames are fixed values!!
  opt.playbookDir = "/var/lib/abc4";
  opt.ipListFile = "/var/lib/abc4/iplist";
  opt.hostListFile = "/var/lib/abc4/hostlist";

  const userData = {
    runcmd: [
      `${opt.createIpList} > ${opt.ipListFile}`,
      `${opt.createHostList} > ${opt.hostListFile}`,
      "echo create IP list file done",
      installAnsible(opt.os),
      "echo install ansible done",
      "ansible-galaxy install -p/etc/ansible/roles so5.ssh_hostbased_auth",
      `sudo -i -u ${opt.user} ansible-playbook ${opt.playbookDir}/setupHostbasedAuth.yml --extra-vars="{ssh_hostbased_auth_permit_root_login: yes, ssh_hostbased_auth_allowed_hosts: [\`sed 's/.*/"&"/' ${opt.ipListFile} | tr '\\n' ',' |sed 's/,$//'\`]}"`,
      "echo setup ssh hostbased auth done",
      `cp /etc/ssh/ssh_known_hosts ~${opt.user}/.ssh/known_hosts`,
      "echo copy known hosts file done",
    ]
  };
  userData.write_files = [
    {
      path: `${opt.playbookDir}/setupHostbasedAuth.yml`,
      mode: 644,
      content: `${getHostbasedAuthPlaybook()}`
    }
  ];

  if (Array.isArray(opt.packages)) {
    userData.packages = opt.packages;
  }
  const makeInventory = [
    `echo '[head]' > ${opt.inventory}`,
    `hostname >> ${opt.inventory}`,
    `echo '[child]' >> ${opt.inventory}`,
    `grep -v -e \`hostname\` ${opt.hostListFile} >> ${opt.inventory}`,
    `chmod +r ${opt.inventory}`,
    "echo generate inventory file done",
    `cat ${opt.inventory}`
  ];

  if (!isChild) {
    userData.runcmd.push(
      ...makeInventory,
      "echo make inventory file done",
      "mkdir /etc/ansible/facts && chmod 777 /etc/ansible/facts",
      `echo [defaults] > ${opt.config}`,
      `echo host_key_checking = False >> ${opt.config}`,
      `echo fact_caching = jsonfile >> ${opt.config}`,
      `echo fact_caching_connection = /etc/ansible/facts >> ${opt.config}`,
      `echo fact_caching_timeout = 8640000 >> ${opt.config}`,
      "echo avoid strict key checking",
      pullRolesFromGalaxy(opt),
      "echo pull roles from ansible-galaxy done",
      runPlaybooks(opt),
      "echo run playbooks done",
    );

    userData.write_files = userData.write_files.concat(
      getPlaybookNames(opt).map((e)=>{
        const option = {};
        if (e === "pbspro") {
          option.useServer = opt.runJobOnBatchServer;
          option.qmgrCmds = ["set server job_history_enable=True"];

          if (Array.isArray(opt.batchSetupScript) && opt.batchSetupScript.length > 0) {
            option.qmgrCmds.push(...opt.batchSetupScript);
          }
        }
        return {
          path: `${opt.playbookDir}/${e}.yml`,
          mode: 755,
          content: `${getPlaybook(e, option)}`
        };
      })
    );

    if (opt.playbook) {
      userData.write_files.push({
        path: `${opt.playbookDir}/userPlaybook.yml`,
        mode: 755,
        content: `${opt.playbook}`
      });
    }
  }
  return userData;
}

module.exports = {
  getUserData
};
