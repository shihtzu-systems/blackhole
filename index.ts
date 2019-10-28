import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as eks from "@pulumi/eks";
import * as kubernetes from "@pulumi/kubernetes";


const clusterName = "blackhole";
const clusterDomain = "shihtzu.io";

const includeClusterFoundation = true;

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
const dnsImage = "registry.opensource.zalan.do/teapot/external-dns:latest"
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
const vpc = new awsx.ec2.Vpc(clusterName, {
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
        "Name": clusterName,
        "kubernetes.io/cluster/blackhole": "owned"
    }
});

export const vpcId = vpc.id;
export const vpcPrivateSubnetIds = vpc.privateSubnetIds;
export const vpcPublicSubnetIds = vpc.publicSubnetIds;

const clusterRole = new aws.iam.Role(clusterName,{
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "ec2.amazonaws.com",
    })
});



// Cluster
const cluster = new eks.Cluster(clusterName, {
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
                            `--cluster-name=${clusterName}`,

                            // AWS VPC ID this ingress controller will use to create AWS resources.
                            // If unspecified, it will be discovered from ec2metadata.
                            `--aws-vpc-id=${vpcId}`,

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
                            `--domain-filter=${clusterDomain}`,
                            "--provider=aws",
                            // would prevent ExternalDNS from deleting any records, omit to enable full synchronization
                            "--policy=upsert-only",
                            // only look at public hosted zones (valid values are public, private or no value for both)
                            "--aws-zone-type=public",
                            "--registry=txt",
                            `--txt-owner-id=${clusterName}`
                        ],
                    }
                ],
                securityContext: {
                    fsGroup: 65534
                }
            }
        }
    }
}, {provider: cluster.provider});
