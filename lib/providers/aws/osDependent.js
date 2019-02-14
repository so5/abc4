"use strict";
const OSFilters = {
  ubuntu16: [{
    Name: "name",
    Values: [
      "ubuntu/images/hvm-ssd/ubuntu-xenial*"
    ]
  },
  {
    Name: "owner-id",
    Values: [
      "099720109477"
    ]
  }
  ],
  ubuntu18: [
    {
      Name: "name",
      Values: [
        "ubuntu/images/hvm-ssd/ubuntu-bionic*"
      ]
    },
    {
      Name: "owner-id",
      Values: [
        "099720109477"
      ]
    }
  ],
  centos6: [
    {
      Name: "name",
      Values: [
        "CentOS Linux 6*"
      ]
    },
    {
      Name: "owner-id",
      Values: [
        "679593333241"
      ]
    }
  ],
  centos7: [
    {
      Name: "name",
      Values: [
        "CentOS Linux 7*"
      ]
    },
    {
      Name: "owner-id",
      Values: [
        "679593333241"
      ]
    }
  ],
  rhel6: [
    {
      Name: "name",
      Values: [
        "RHEL-6*"
      ]
    },
    {
      Name: "owner-id",
      Values: [
        "309956199498"
      ]
    }
  ],
  rhel7: [{
    Name: "name",
    Values: [
      "RHEL-7*"
    ]
  },
  {
    Name: "owner-id",
    Values: [
      "309956199498"
    ]
  }
  ]
};

const defaultFilter = [
  {
    Name: "architecture",
    Values: ["x86_64"]
  },
  {
    Name: "state",
    Values: ["available"]
  }
];

function getAMIQueryFilter(os) {
  const osFilter = OSFilters[os];
  return osFilter ? defaultFilter.concat(osFilter) : null;
}

function getUserName(os) {
  if (os.startsWith("centos")) {
    return "centos";
  }
  if (os.startsWith("ubuntu")) {
    return "ubuntu";
  }
  return "ec2-user";
}


module.exports = {
  getAMIQueryFilter,
  getUserName
};
