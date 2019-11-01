import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as eks from "@pulumi/eks";
import * as kubernetes from "@pulumi/kubernetes";

const config = new pulumi.Config();
const name = config.require("name");
const domain = config.require("domain");
const certArn = config.require("cert-arn");
const wordpressPassword = config.require("wordpress-password");

// AWS ALB Ingress Controller
const albName = "alb-ingress-controller";
const albImage = "docker.io/amazon/aws-alb-ingress-controller:v1.1.3";
const albLabels = {
    "app.kubernetes.io/name": albName
};
const albMetadata = {
    name: albName,
    labels: albLabels
};

const albIamPolicy = new aws.iam.Policy(albName, {
    policy: {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: [
                    "acm:DescribeCertificate",
                    "acm:ListCertificates",
                    "acm:GetCertificate"
                ],
                Resource: "*",
            },
            {
                Effect: "Allow",
                Action: [
                    "ec2:AuthorizeSecurityGroupIngress",
                    "ec2:CreateSecurityGroup",
                    "ec2:CreateTags",
                    "ec2:DeleteTags",
                    "ec2:DeleteSecurityGroup",
                    "ec2:DescribeAccountAttributes",
                    "ec2:DescribeAddresses",
                    "ec2:DescribeInstances",
                    "ec2:DescribeInstanceStatus",
                    "ec2:DescribeInternetGateways",
                    "ec2:DescribeNetworkInterfaces",
                    "ec2:DescribeSecurityGroups",
                    "ec2:DescribeSubnets",
                    "ec2:DescribeTags",
                    "ec2:DescribeVpcs",
                    "ec2:ModifyInstanceAttribute",
                    "ec2:ModifyNetworkInterfaceAttribute",
                    "ec2:RevokeSecurityGroupIngress"
                ],
                Resource: "*",
            },
            {
                Effect: "Allow",
                Action: [
                    "elasticloadbalancing:AddListenerCertificates",
                    "elasticloadbalancing:AddTags",
                    "elasticloadbalancing:CreateListener",
                    "elasticloadbalancing:CreateLoadBalancer",
                    "elasticloadbalancing:CreateRule",
                    "elasticloadbalancing:CreateTargetGroup",
                    "elasticloadbalancing:DeleteListener",
                    "elasticloadbalancing:DeleteLoadBalancer",
                    "elasticloadbalancing:DeleteRule",
                    "elasticloadbalancing:DeleteTargetGroup",
                    "elasticloadbalancing:DeregisterTargets",
                    "elasticloadbalancing:DescribeListenerCertificates",
                    "elasticloadbalancing:DescribeListeners",
                    "elasticloadbalancing:DescribeLoadBalancers",
                    "elasticloadbalancing:DescribeLoadBalancerAttributes",
                    "elasticloadbalancing:DescribeRules",
                    "elasticloadbalancing:DescribeSSLPolicies",
                    "elasticloadbalancing:DescribeTags",
                    "elasticloadbalancing:DescribeTargetGroups",
                    "elasticloadbalancing:DescribeTargetGroupAttributes",
                    "elasticloadbalancing:DescribeTargetHealth",
                    "elasticloadbalancing:ModifyListener",
                    "elasticloadbalancing:ModifyLoadBalancerAttributes",
                    "elasticloadbalancing:ModifyRule",
                    "elasticloadbalancing:ModifyTargetGroup",
                    "elasticloadbalancing:ModifyTargetGroupAttributes",
                    "elasticloadbalancing:RegisterTargets",
                    "elasticloadbalancing:RemoveListenerCertificates",
                    "elasticloadbalancing:RemoveTags",
                    "elasticloadbalancing:SetIpAddressType",
                    "elasticloadbalancing:SetSecurityGroups",
                    "elasticloadbalancing:SetSubnets",
                    "elasticloadbalancing:SetWebACL"
                ],
                Resource: "*",
            },
            {
                Effect: "Allow",
                Action: [
                    "iam:CreateServiceLinkedRole",
                    "iam:GetServerCertificate",
                    "iam:ListServerCertificates"
                ],
                Resource: "*",
            },
            {
                Effect: "Allow",
                Action: [
                    "cognito-idp:DescribeUserPoolClient"
                ],
                Resource: "*",
            },
            {
                Effect: "Allow",
                Action: [
                    "waf-regional:GetWebACLForResource",
                    "waf-regional:GetWebACL",
                    "waf-regional:AssociateWebACL",
                    "waf-regional:DisassociateWebACL"
                ],
                Resource: "*",
            },
            {
                Effect: "Allow",
                Action: [
                    "tag:GetResources",
                    "tag:TagResources"
                ],
                Resource: "*",
            },
            {
                Effect: "Allow",
                Action: [
                    "waf:GetWebACL"
                ],
                Resource: "*",
            },
        ],
    },
});

export const albIamPolicyArn = albIamPolicy.arn;

// External DNS
const dnsName = "external-dns";
const dnsImage = "registry.opensource.zalan.do/teapot/external-dns:latest";
const dnsLabels = {
    "app.kubernetes.io/name": dnsName
};
const dnsMetadata = {
    name: dnsName,
    labels: dnsLabels
};

const dnsIamPolicy = new aws.iam.Policy(dnsName, {
    policy: {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: [
                    "route53:ChangeResourceRecordSets"
                ],
                Resource: "arn:aws:route53:::hostedzone/*",
            },
            {
                Effect: "Allow",
                Action: [
                    "route53:ListHostedZones",
                    "route53:ListResourceRecordSets"
                ],
                Resource: "*",
            },
        ],
    },
});

export const dnsIamPolicyArn = dnsIamPolicy.arn;

// VPC
const vpc = new awsx.ec2.Vpc(name, {
    cidrBlock: "10.99.0.0/16",
    subnets: [
        {
            type: "private",
            tags: {
                "kubernetes.io/cluster/blackhole": "owned",
                "kubernetes.io/role/internal-elb": "1",
            },
            assignIpv6AddressOnCreation: false,
        },
        {
            type: "public",
            tags: {
                "kubernetes.io/cluster/blackhole": "owned",
                "kubernetes.io/role/elb": "1",
            },
            assignIpv6AddressOnCreation: false,
        }
    ],
    numberOfAvailabilityZones: 2,
    numberOfNatGateways: 1,
    tags: {
        "Name": name,
        "kubernetes.io/cluster/blackhole": "owned"
    }
});

export const vpcId = vpc.id;
export const vpcPrivateSubnetIds = vpc.privateSubnetIds;
export const vpcPublicSubnetIds = vpc.publicSubnetIds;

const clusterRole = new aws.iam.Role(name,{
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "ec2.amazonaws.com",
    })
});



// Cluster
const cluster = new eks.Cluster(name, {
    vpcId: vpcId,
    subnetIds: vpcPrivateSubnetIds,
    nodeAssociatePublicIpAddress: false,
    deployDashboard: false
});

// managed policies
const clusterRoleName = cluster.eksCluster.roleArn.apply(v => v.replace("arn:aws:iam::272944578466:role/", ""));
const eksWorkerNodePolicy = new aws.iam.RolePolicyAttachment("eks-worker-node", {
    role: clusterRoleName,
    policyArn: "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
});
const eksCNIPolicy = new aws.iam.RolePolicyAttachment("eks-cni", {
    role: clusterRoleName,
    policyArn: "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
});
const ecrReadOnlyPolicy = new aws.iam.RolePolicyAttachment("ecr-read-only", {
    role: clusterRoleName,
    policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
});

// user defined policies
const albRolePolicyAttach = new aws.iam.RolePolicyAttachment(albName, {
    role:  clusterRoleName,
    policyArn: albIamPolicyArn
});
const dnsRolePolicyAttach = new aws.iam.RolePolicyAttachment(dnsName, {
    role: clusterRoleName,
    policyArn: dnsIamPolicyArn
});

export const kubeconfig = cluster.kubeconfig;


// Shared Resources
const redisName = `${name}-redis`;

const redisSecurityGroup = new awsx.ec2.SecurityGroup(redisName, {
    vpc: vpc,
});

redisSecurityGroup.createIngressRule(redisName, {
    location: {
        cidrBlocks: [ vpc.vpc.cidrBlock ]
    },
    ports: new awsx.ec2.TcpPorts(6379),
    description: "allow internal redis traffic",
});

redisSecurityGroup.createEgressRule(redisName, {
    location: {
        cidrBlocks: [ "0.0.0.0/0" ]
    },
    ports: new awsx.ec2.AllTraffic(),
    description: "allow internet traffic",
});

const redisSubnetGroup = new aws.elasticache.SubnetGroup(redisName, {
    subnetIds: vpc.privateSubnetIds
});

const cacheRedis = new aws.elasticache.Cluster(redisName, {
    azMode: "single-az",
    clusterId: redisName,
    engine: "redis",
    engineVersion: "5.0.5",
    nodeType: "cache.t2.small",
    numCacheNodes: 1,
    securityGroupIds: [ redisSecurityGroup.id ],
    subnetGroupName: redisSubnetGroup.name,
    tags: {
        "Name": redisName,
        "kubernetes.io/cluster/blackhole": "owned"
    }
});

// Cluster Foundation

// AWS ALB Ingress Controller
const albServiceAccount = new kubernetes.core.v1.ServiceAccount(albName, {
    metadata: albMetadata
}, {provider: cluster.provider});

const albClusterRole = new kubernetes.rbac.v1.ClusterRole(albName, {
    metadata: albMetadata,
    rules: [
        {
            apiGroups: [
                "",
                "extensions",
            ],
            resources: [
                "configmaps",
                "endpoints",
                "events",
                "ingresses",
                "ingresses/status",
                "services",
            ],
            verbs: [
                "create",
                "get",
                "list",
                "update",
                "watch",
                "patch",
            ]
        },
        {
            apiGroups: [
                "",
                "extensions",
            ],
            resources: [
                "nodes",
                "pods",
                "secrets",
                "services",
                "namespaces",
            ],
            verbs: [
                "get",
                "list",
                "watch",
            ]
        }
    ]
}, {provider: cluster.provider});

const albClusterRoleBinding = new kubernetes.rbac.v1.ClusterRoleBinding(albName, {
    metadata: albMetadata,
    roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: albClusterRole.kind,
        name: albName,
    },
    subjects: [
        {
            kind: albServiceAccount.kind,
            name: albServiceAccount.metadata.name,
            namespace: albServiceAccount.metadata.namespace,
        }
    ]
}, {provider: cluster.provider});

const albDeployment = new kubernetes.apps.v1.Deployment(albName, {
    metadata: albMetadata,
    spec: {
        selector: {
            matchLabels: albLabels
        },
        template: {
            metadata: {
                labels: albLabels
            },
            spec: {
                serviceAccountName: albServiceAccount.metadata.name,
                containers: [
                    {
                        name: albName,
                        image: albImage,
                        args: [
                            // Limit the namespace where this ALB Ingress Controller deployment will
                            // resolve ingress resources. If left commented, all namespaces are used.
                            // "--watch-namespace=your-k8s-namespace",

                            // Setting the ingress-class flag below ensures that only ingress resources with the
                            // annotation kubernetes.io/ingress.class: "alb" are respected by the controller. You may
                            // choose any class you'd like for this controller to respect.
                            // "--ingress-class=alb",

                            // REQUIRED
                            // Name of your cluster. Used when naming resources created
                            // by the ALB Ingress Controller, providing distinction between
                            // clusters.
                            `--cluster-name=${name}`,

                            // AWS VPC ID this ingress controller will use to create AWS resources.
                            // If unspecified, it will be discovered from ec2metadata.
                            vpcId.apply(v => `--aws-vpc-id=${v}`),

                            // AWS region this ingress controller will operate in.
                            // If unspecified, it will be discovered from ec2metadata.
                            // List of regions: http://docs.aws.amazon.com/general/latest/gr/rande.html#vpc_region
                            "--aws-region=us-west-2",

                            // Enables logging on all outbound requests sent to the AWS API.
                            // If logging is desired, set to true.
                            // "--aws-api-debug=true",

                            // Maximum number of times to retry the aws calls.
                            // defaults to 10.
                            "--aws-max-retries=10",
                        ]
                    }
                ]
            }
        }
    }
}, {provider: cluster.provider});


// External DNS
const dnsServiceAccount = new kubernetes.core.v1.ServiceAccount(dnsName, {
    metadata: dnsMetadata
}, {provider: cluster.provider});

const dnsClusterRole = new kubernetes.rbac.v1.ClusterRole(dnsName, {
    metadata: dnsMetadata,
    rules: [
        {
            apiGroups: [
                "",
                "extensions",
            ],
            resources: [
                "services",
                "pods",
                "ingresses",
            ],
            verbs: [
                "get",
                "list",
                "watch",
            ]
        },
        {
            apiGroups: [
                "",
            ],
            resources: [
                "nodes",
            ],
            verbs: [
                "list",
            ]
        }
    ]
}, {provider: cluster.provider});

const dnsClusterRoleBinding = new kubernetes.rbac.v1.ClusterRoleBinding(dnsName, {
    metadata: dnsMetadata,
    roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: dnsClusterRole.kind,
        name: dnsName,
    },
    subjects: [
        {
            kind: dnsServiceAccount.kind,
            name: dnsServiceAccount.metadata.name,
            namespace: dnsServiceAccount.metadata.namespace,
        }
    ]
}, {provider: cluster.provider});


const dnsDeployment = new kubernetes.apps.v1.Deployment(dnsName, {
    metadata: dnsMetadata,
    spec: {
        selector: {
            matchLabels: dnsLabels
        },
        template: {
            metadata: {
                labels: dnsLabels
            },
            spec: {
                serviceAccountName: dnsServiceAccount.metadata.name,
                containers: [
                    {
                        name: dnsName,
                        image: dnsImage,
                        args: [
                            "--source=service",
                            "--source=ingress",
                            // will make ExternalDNS see only the hosted zones matching provided domain, omit to process all available hosted zones
                            `--domain-filter=${domain}`,
                            "--provider=aws",
                            // would prevent ExternalDNS from deleting any records, omit to enable full synchronization
                            "--policy=upsert-only",
                            // only look at public hosted zones (valid values are public, private or no value for both)
                            "--aws-zone-type=public",
                            "--registry=txt",
                            `--txt-owner-id=${name}`
                        ],
                    },
                ],
                securityContext: {
                    fsGroup: 65534
                }
            }
        }
    }
}, {provider: cluster.provider});


// Networking
const mainDomain = `main.${domain}`;
const yoloDomain = `yolo.${domain}`;

const mainZone = new aws.route53.Zone(mainDomain, {
    name: mainDomain,
    forceDestroy: true,
});

const yoloZone = new aws.route53.Zone(yoloDomain, {
    name: yoloDomain,
    forceDestroy: true,
});


// Stuff

const wordpressName = "wordpress";
const wordpressImage = "wordpress:4.8-apache";
const wordpressLabels = {
    "app.kubernetes.io/name": wordpressName
};
const wordpressMetadata = {
    name: wordpressName,
    labels: wordpressLabels
};

const wordpressPvc = new kubernetes.core.v1.PersistentVolumeClaim(wordpressName, {
    metadata: wordpressMetadata,
    spec: {
        accessModes: [
            "ReadWriteOnce"
        ],
        resources: {
            requests: {
                storage: "20Gi"
            }
        }
    }
});
const wordpressDeployment = new kubernetes.apps.v1.Deployment(wordpressName, {
    metadata: wordpressMetadata,
    spec: {
        selector: {
            matchLabels: wordpressLabels,
        },
        strategy: {
            type: "Recreate",
        },
        template: {
            metadata: wordpressMetadata,
            spec: {
                containers: [
                    {
                        name: "main",
                        image: wordpressImage,
                        env: [
                            {
                                name: "WORDPRESS_DB_HOST",
                                value: `${wordpressName}-mysql`
                            },
                            {
                                name: "WORDPRESS_DB_PASSWORD",
                                value: wordpressPassword,
                            }
                        ],
                        ports: [
                            {
                                name: "http",
                                containerPort: 80
                            }
                        ],
                        volumeMounts: [
                            {
                                name: wordpressName,
                                mountPath: "/var/www/html"
                            }
                        ]
                    }
                ],
                volumes: [
                    {
                        name: wordpressName,
                        persistentVolumeClaim: {
                            claimName: wordpressName
                        }
                    }
                ]
            }
        }
    }
});
const wordpressService = new kubernetes.core.v1.Service(wordpressName, {
    metadata: wordpressMetadata,
    spec: {
     type: "NodePort",
        selector: wordpressLabels,
        ports: [
            {
                name: "http",
                port: 80
            }
        ]
    }
});


const wordpressMysqlName = `${wordpressName}-mysql`;
const wordpressMysqlImage = "mysql:5.6";
const wordpressMysqlLabels = {
    "app.kubernetes.io/name": wordpressMysqlName,
};
const wordpressMysqlMetadata = {
    name: wordpressMysqlName,
    labels: wordpressMysqlLabels
};

const wordpressMysqlPvc = new kubernetes.core.v1.PersistentVolumeClaim(wordpressMysqlName, {
    metadata: wordpressMysqlMetadata,
    spec: {
        accessModes: [
            "ReadWriteOnce"
        ],
        resources: {
            requests: {
                storage: "20Gi"
            }
        }
    }
});
const wordpressMysqlDeployment = new kubernetes.apps.v1.Deployment(wordpressMysqlName, {
    metadata: wordpressMysqlMetadata,
    spec: {
        selector: {
            matchLabels: wordpressMysqlLabels,
        },
        strategy: {
            type: "Recreate",
        },
        template: {
            metadata: wordpressMysqlMetadata,
            spec: {
                containers: [
                    {
                        name: "main",
                        image: wordpressMysqlImage,
                        env: [
                            {
                                name: "MYSQL_ROOT_PASSWORD",
                                value: wordpressPassword
                            },
                        ],
                        ports: [
                            {
                                name: "mysql",
                                containerPort: 3306
                            }
                        ],
                        volumeMounts: [
                            {
                                name: wordpressMysqlName,
                                mountPath: "/var/lib/mysql"
                            }
                        ]
                    }
                ],
                volumes: [
                    {
                        name: wordpressMysqlName,
                        persistentVolumeClaim: {
                            claimName: wordpressMysqlName
                        }
                    }
                ]
            }
        }
    }
});
const wordpressMysqlService = new kubernetes.core.v1.Service(wordpressMysqlName, {
    metadata: wordpressMysqlMetadata,
    spec: {
        selector: wordpressMysqlLabels,
        clusterIP: "None",
        ports: [
            {
                port: 3306
            }
        ]
    }
});

// Common

const mainIngress = new kubernetes.networking.v1beta1.Ingress(name, {
    metadata: {
        name: name,
        annotations: {
            "kubernetes.io/ingress.class": "alb",
            "alb.ingress.kubernetes.io/scheme": "internet-facing",
            "alb.ingress.kubernetes.io/tags": `Environment=${name}`,
            "alb.ingress.kubernetes.io/listen-ports": `[{"HTTP": 80, "HTTPS": 443}]`,
            "alb.ingress.kubernetes.io/certificate-arn": certArn,
            "alb.ingress.kubernetes.io/actions.ssl-redirect": `{"Type": "redirect", "RedirectConfig": { "Protocol": "HTTPS", "Port": "443", "StatusCode": "HTTP_301"}}`
        }
    },
    spec: {
        rules: [
            {
                host: "shihtzu.io",
                http: {
                    paths: [
                        {
                            path: "/*",
                            backend: {
                                serviceName: "ssl-redirect",
                                servicePort: "use-annotation"
                            }
                        },
                        {
                            path: "/*",
                            backend: {
                                serviceName: "shihtzu-io",
                                servicePort: "http"
                            }
                        }
                    ]
                }
            },
            {
                host: "wp.shihtzu.io",
                http: {
                    paths: [
                        {
                            path: "/*",
                            backend: {
                                serviceName: "ssl-redirect",
                                servicePort: "use-annotation"
                            }
                        },
                        {
                            path: "/*",
                            backend: {
                                serviceName: "wordpress",
                                servicePort: "http"
                            }
                        }
                    ]
                }
            },
            {
                host: `bright.${domain}`,
                http: {
                    paths: [
                        {
                            path: "/*",
                            backend: {
                                serviceName: "ssl-redirect",
                                servicePort: "use-annotation"
                            }
                        },
                        {
                            path: "/*",
                            backend: {
                                serviceName: "bright-main",
                                servicePort: "http"
                            }
                        }
                    ]
                }
            },
            {
                host: `bright.${mainDomain}`,
                http: {
                    paths: [
                        {
                            path: "/*",
                            backend: {
                                serviceName: "ssl-redirect",
                                servicePort: "use-annotation"
                            }
                        },
                        {
                            path: "/*",
                            backend: {
                                serviceName: "bright-main",
                                servicePort: "http"
                            }
                        }
                    ]
                }
            },
            {
                host: `bright.${yoloDomain}`,
                http: {
                    paths: [
                        {
                            path: "/*",
                            backend: {
                                serviceName: "ssl-redirect",
                                servicePort: "use-annotation"
                            }
                        },
                        {
                            path: "/*",
                            backend: {
                                serviceName: "bright-yolo",
                                servicePort: "http"
                            }
                        }
                    ]
                }
            },
        ]
    }
});
