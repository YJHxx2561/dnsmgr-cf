/**
 * DNS 平台元数据（自动从 PHP DnsHelper.php 提取，请勿手工修改）
 * 保留全部 22 个平台的字段定义与能力声明。
 */
export interface ConfigField {
  name: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  options?: Record<string, string> | Array<{ value: string; label: string }>;
  value?: string;
}
export interface ProviderMeta {
  name: string;
  icon: string;
  note?: string;
  config: Record<string, ConfigField>;
  remark: number;
  status: boolean;
  redirect: boolean;
  log: boolean;
  weight: boolean;
  page: boolean;
  add: boolean;
  sort: boolean;
}
export const DNS_CONFIG: Record<string, ProviderMeta> = {
  "aliyun": {
    "name": "阿里云",
    "icon": "aliyun.png",
    "note": "",
    "config": {
      "AccessKeyId": {
        "name": "AccessKeyId",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "AccessKeySecret": {
        "name": "AccessKeySecret",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 1,
    "status": true,
    "redirect": true,
    "log": true,
    "weight": false,
    "page": false,
    "add": true,
    "sort": true
  },
  "dnspod": {
    "name": "腾讯云",
    "icon": "dnspod.ico",
    "note": "",
    "config": {
      "SecretId": {
        "name": "SecretId",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "SecretKey": {
        "name": "SecretKey",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 1,
    "status": true,
    "redirect": true,
    "log": true,
    "weight": true,
    "page": false,
    "add": true,
    "sort": true
  },
  "huawei": {
    "name": "华为云",
    "icon": "huawei.ico",
    "note": "",
    "config": {
      "AccessKeyId": {
        "name": "AccessKeyId",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "SecretAccessKey": {
        "name": "SecretAccessKey",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 2,
    "status": true,
    "redirect": false,
    "log": false,
    "weight": true,
    "page": false,
    "add": true,
    "sort": true
  },
  "baidu": {
    "name": "百度云",
    "icon": "baidu.ico",
    "note": "",
    "config": {
      "AccessKeyId": {
        "name": "AccessKeyId",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "SecretAccessKey": {
        "name": "SecretAccessKey",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 2,
    "status": false,
    "redirect": false,
    "log": false,
    "weight": false,
    "page": true,
    "add": true,
    "sort": false
  },
  "west": {
    "name": "西部数码",
    "icon": "west.ico",
    "note": "",
    "config": {
      "username": {
        "name": "用户名",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "api_password": {
        "name": "API密码",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 0,
    "status": true,
    "redirect": false,
    "log": false,
    "weight": false,
    "page": false,
    "add": false,
    "sort": false
  },
  "huoshan": {
    "name": "火山引擎",
    "icon": "huoshan.ico",
    "note": "",
    "config": {
      "AccessKeyId": {
        "name": "AccessKeyId",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "SecretAccessKey": {
        "name": "SecretAccessKey",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 2,
    "status": true,
    "redirect": false,
    "log": false,
    "weight": true,
    "page": false,
    "add": true,
    "sort": false
  },
  "jdcloud": {
    "name": "京东云",
    "icon": "jdcloud.ico",
    "note": "",
    "config": {
      "AccessKeyId": {
        "name": "AccessKeyId",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "AccessKeySecret": {
        "name": "AccessKeySecret",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 0,
    "status": true,
    "redirect": true,
    "log": false,
    "weight": true,
    "page": false,
    "add": true,
    "sort": false
  },
  "dnsla": {
    "name": "DNSLA",
    "icon": "dnsla.ico",
    "note": "",
    "config": {
      "apiid": {
        "name": "APIID",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "apisecret": {
        "name": "API密钥",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 0,
    "status": true,
    "redirect": true,
    "log": false,
    "weight": true,
    "page": false,
    "add": true,
    "sort": false
  },
  "qingcloud": {
    "name": "青云",
    "icon": "qingcloud.ico",
    "note": "",
    "config": {
      "access_key_id": {
        "name": "Access Key ID",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "secret_access_key": {
        "name": "Secret Access Key",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 0,
    "status": true,
    "redirect": false,
    "log": false,
    "weight": true,
    "page": false,
    "add": false,
    "sort": false
  },
  "bt": {
    "name": "宝塔域名",
    "icon": "bt.png",
    "note": "",
    "config": {
      "AccessKey": {
        "name": "Access Key",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "SecretKey": {
        "name": "Secret Key",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "AccountID": {
        "name": "Account ID",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 2,
    "status": true,
    "redirect": false,
    "log": false,
    "weight": true,
    "page": false,
    "add": true,
    "sort": false
  },
  "cloudflare": {
    "name": "Cloudflare",
    "icon": "cloudflare.ico",
    "note": "",
    "config": {
      "email": {
        "name": "邮箱地址",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "apikey": {
        "name": "API密钥/令牌",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "auth": {
        "name": "认证方式",
        "type": "radio",
        "options": {
          "0": "API密钥",
          "1": "API令牌"
        },
        "value": "0"
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 2,
    "status": true,
    "redirect": false,
    "log": false,
    "weight": false,
    "page": false,
    "add": true,
    "sort": true
  },
  "aws": {
    "name": "AWS Route 53",
    "icon": "aws.png",
    "note": "基于 Amazon Route 53 管理域名解析，AccessKey 需具备 Route 53 权限",
    "config": {
      "AccessKeyId": {
        "name": "AccessKeyId",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "SecretAccessKey": {
        "name": "SecretAccessKey",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 0,
    "status": false,
    "redirect": false,
    "log": false,
    "weight": false,
    "page": true,
    "add": true,
    "sort": false
  },
  "namesilo": {
    "name": "NameSilo",
    "icon": "namesilo.ico",
    "note": "",
    "config": {
      "username": {
        "name": "账户名",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "apikey": {
        "name": "API Key",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 0,
    "status": false,
    "redirect": false,
    "log": false,
    "weight": false,
    "page": true,
    "add": false,
    "sort": false
  },
  "henet": {
    "name": "HE DNS",
    "icon": "he.ico",
    "note": "",
    "config": {
      "username": {
        "name": "用户名/邮箱",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "password": {
        "name": "密码",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 0,
    "status": false,
    "redirect": false,
    "log": false,
    "weight": false,
    "page": true,
    "add": false,
    "sort": false
  },
  "spaceship": {
    "name": "Spaceship",
    "icon": "spaceship.ico",
    "note": "",
    "config": {
      "apikey": {
        "name": "API Key",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "apisecret": {
        "name": "API Secret",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 0,
    "status": false,
    "redirect": true,
    "log": false,
    "weight": false,
    "page": false,
    "add": false,
    "sort": false
  },
  "powerdns": {
    "name": "PowerDNS",
    "icon": "powerdns.ico",
    "note": "",
    "config": {
      "ip": {
        "name": "IP地址",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "port": {
        "name": "端口",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "apikey": {
        "name": "API KEY",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 2,
    "status": true,
    "redirect": false,
    "log": false,
    "weight": false,
    "page": true,
    "add": true,
    "sort": false
  },
  "technitium": {
    "name": "Technitium",
    "icon": "technitium.png",
    "note": "",
    "config": {
      "url": {
        "name": "Server URL",
        "type": "input",
        "placeholder": "http://127.0.0.1:5380",
        "required": true
      },
      "token": {
        "name": "API Token",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 2,
    "status": true,
    "redirect": false,
    "log": false,
    "weight": false,
    "page": true,
    "add": true,
    "sort": false
  },
  "aliyunesa": {
    "name": "阿里云ESA",
    "icon": "aliyun.png",
    "note": "仅支持以NS方式接入阿里云ESA的域名",
    "config": {
      "AccessKeyId": {
        "name": "AccessKeyId",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "AccessKeySecret": {
        "name": "AccessKeySecret",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "region": {
        "name": "API接入点",
        "type": "select",
        "options": [
          {
            "value": "cn-hangzhou",
            "label": "中国内地"
          },
          {
            "value": "ap-southeast-1",
            "label": "非中国内地"
          }
        ],
        "value": "cn-hangzhou",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 2,
    "status": false,
    "redirect": false,
    "log": false,
    "weight": false,
    "page": false,
    "add": false,
    "sort": false
  },
  "tencenteo": {
    "name": "腾讯云EO",
    "icon": "tencent.png",
    "note": "仅支持以NS方式接入腾讯云EO的域名",
    "config": {
      "SecretId": {
        "name": "SecretId",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "SecretKey": {
        "name": "SecretKey",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "site_type": {
        "name": "API接入点",
        "type": "select",
        "options": [
          {
            "value": "cn",
            "label": "中国内地"
          },
          {
            "value": "intl",
            "label": "非中国内地"
          }
        ],
        "value": "cn",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 0,
    "status": true,
    "redirect": false,
    "log": false,
    "weight": true,
    "page": false,
    "add": false,
    "sort": true
  },
  "dnsmgr": {
    "name": "同系统对接",
    "icon": "logo.png",
    "note": "对接其他聚合DNS管理系统站点",
    "config": {
      "base_url": {
        "name": "站点地址",
        "type": "input",
        "placeholder": "例如：https://dns.example.com",
        "required": true
      },
      "uid": {
        "name": "用户 ID",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "key": {
        "name": "API 密钥",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 2,
    "status": true,
    "redirect": true,
    "log": false,
    "weight": true,
    "page": false,
    "add": false,
    "sort": false
  },
  "goedge": {
    "name": "GoEdge智能DNS",
    "icon": "logo.png",
    "note": "需要填写GoEdge HTTP API节点地址，不是管理后台地址或gRPC地址",
    "config": {
      "base_url": {
        "name": "API节点地址",
        "type": "input",
        "placeholder": "例如：https://api.example.com:8004",
        "required": true
      },
      "accessKeyId": {
        "name": "AccessKey ID",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "accessKey": {
        "name": "AccessKey",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "type": {
        "name": "AccessKey类型",
        "type": "radio",
        "options": {
          "admin": "管理员",
          "user": "用户"
        },
        "value": "admin"
      },
      "nsClusterId": {
        "name": "DNS集群ID",
        "type": "input",
        "placeholder": "例如：1",
        "required": true
      },
      "userId": {
        "name": "GoEdge用户ID（可选）",
        "type": "input",
        "placeholder": "留空表示不指定用户",
        "required": false
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 2,
    "status": true,
    "redirect": false,
    "log": false,
    "weight": true,
    "page": false,
    "add": true,
    "sort": false
  },
  "dynv6": {
    "name": "dynv6",
    "icon": "dynv6.ico",
    "note": "",
    "config": {
      "token": {
        "name": "API Token",
        "type": "input",
        "placeholder": "",
        "required": true
      },
      "proxy": {
        "name": "使用代理服务器",
        "type": "radio",
        "options": {
          "0": "否",
          "1": "是"
        },
        "value": "0"
      }
    },
    "remark": 0,
    "status": false,
    "redirect": false,
    "log": false,
    "weight": false,
    "page": false,
    "add": false,
    "sort": false
  }
};
export const LINE_NAME: Record<string, Record<string, string>> = {
  "aliyun": {
    "DEF": "default",
    "CT": "telecom",
    "CU": "unicom",
    "CM": "mobile",
    "AB": "oversea"
  },
  "dnspod": {
    "DEF": "0",
    "CT": "10=0",
    "CU": "10=1",
    "CM": "10=3",
    "AB": "3=0"
  },
  "huawei": {
    "DEF": "default_view",
    "CT": "Dianxin",
    "CU": "Liantong",
    "CM": "Yidong",
    "AB": "Abroad"
  },
  "west": {
    "DEF": "",
    "CT": "LTEL",
    "CU": "LCNC",
    "CM": "LMOB",
    "AB": "LFOR"
  },
  "dnsla": {
    "DEF": "",
    "CT": "84613316902921216",
    "CU": "84613316923892736",
    "CM": "84613316953252864",
    "AB": ""
  },
  "huoshan": {
    "DEF": "default",
    "CT": "telecom",
    "CU": "unicom",
    "CM": "mobile",
    "AB": "oversea"
  },
  "baidu": {
    "DEF": "default",
    "CT": "ct",
    "CU": "cnc",
    "CM": "cmnet",
    "AB": ""
  },
  "jdcloud": {
    "DEF": "-1",
    "CT": "1",
    "CU": "2",
    "CM": "3",
    "AB": "4"
  },
  "bt": {
    "DEF": "0",
    "CT": "285344768",
    "CU": "285345792",
    "CM": "285346816"
  },
  "qingcloud": {
    "DEF": "0",
    "CT": "2",
    "CU": "3",
    "CM": "4",
    "AB": "8"
  },
  "cloudflare": {
    "DEF": "0"
  },
  "aws": {
    "DEF": "default"
  },
  "namesilo": {
    "DEF": "default"
  },
  "henet": {
    "DEF": "default"
  },
  "powerdns": {
    "DEF": "default"
  },
  "spaceship": {
    "DEF": "default"
  },
  "aliyunesa": {
    "DEF": "0"
  },
  "tencenteo": {
    "DEF": "Default"
  },
  "dnsmgr": {
    "DEF": "default"
  },
  "goedge": {
    "DEF": "default"
  }
};
export const RECORD_TYPE_SUPPORT: Record<string, string[]> = {
  "aliyun": [
    "ALIAS"
  ],
  "henet": [
    "ALIAS"
  ],
  "powerdns": [
    "ALIAS"
  ],
  "spaceship": [
    "ALIAS"
  ]
};
export const DNS_PROVIDER_KEYS: string[] = ["aliyun","dnspod","huawei","baidu","west","huoshan","jdcloud","dnsla","qingcloud","bt","cloudflare","aws","namesilo","henet","spaceship","powerdns","technitium","aliyunesa","tencenteo","dnsmgr","goedge","dynv6"];
