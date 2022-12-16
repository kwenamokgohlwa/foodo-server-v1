import * as cdk from '@aws-cdk/core'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as appsync from '@aws-cdk/aws-appsync'
import * as lambda from '@aws-cdk/aws-lambda'
import * as lambdaNode from '@aws-cdk/aws-lambda-nodejs'
import * as rds from '@aws-cdk/aws-rds'
import * as iam from '@aws-cdk/aws-iam'
import * as amplify from '@aws-cdk/aws-amplify'
import * as cognito from "@aws-cdk/aws-cognito";

export class FoodoStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // CREATE COGNITO USER POOL AND IDENTITY POOL
    const userPool = new cognito.UserPool(this, 'FoodoUserPool', {
      selfSignUpEnabled: true, // Allow users to sign up
      autoVerify: { email: true }, // Verify email addresses by sending a verification code
      signInAliases: { email: true }, // Set email as an alias
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'FoodoUserPoolClient', {
      userPool,
      generateSecret: false, // Don't need to generate secret for web app running on browsers
    });

    const identityPool = new cognito.CfnIdentityPool(this, 'FoodoIdentityPool', {
      allowUnauthenticatedIdentities: true,
      cognitoIdentityProviders: [ {
        clientId: userPoolClient.userPoolClientId,
        providerName: userPool.userPoolProviderName,
      }],
    });

    const isAnonymousCognitoGroupRole = new iam.Role(
      this,
      'foodo-anonymous-group-role',
      {
        description: 'Default role for anonymous users',
        assumedBy: new iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': identityPool.ref,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'unauthenticated',
            },
          },
          'sts:AssumeRoleWithWebIdentity',
        ),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole',
          ),
        ],
      },
    );

    const isUserCognitoGroupRole = new iam.Role(this, 'foodo-users-group-role', {
      description: 'Default role for authenticated users',
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    new cognito.CfnIdentityPoolRoleAttachment(
      this,
      'foodo-identity-pool-role-attachment',
      {
        identityPoolId: identityPool.ref,
        roles: {
          authenticated: isUserCognitoGroupRole.roleArn,
          unauthenticated: isAnonymousCognitoGroupRole.roleArn,
        },
        roleMappings: {
          mapping: {
            type: 'Token',
            ambiguousRoleResolution: 'AuthenticatedRole',
            identityProvider: `cognito-idp.${
              cdk.Stack.of(this).region
            }.amazonaws.com/${userPool.userPoolId}:${
              userPoolClient.userPoolClientId
            }`,
          },
        },
      },
    );

    // Create the AppSync API
    const api = new appsync.GraphqlApi(this, 'Api', {
      name: 'foodo-api',
      schema: appsync.Schema.fromAsset('graphql/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: userPool,
            appIdClientRegex: userPoolClient.userPoolClientId,
            defaultAction: appsync.UserPoolDefaultAction.ALLOW
          }
        }
      }
    })

    const foodoApp = new amplify.App(this, 'foodo-client', {
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'kwenamokgohlwa',
        repository: 'foodo-client',
        oauthToken: cdk.SecretValue.secretsManager('foodo-github-admin', {
          jsonField: 'foodo-github-admin',
        })
      }),
      environmentVariables: {
        'ENDPOINT': api.graphqlUrl || '',
        'API_KEY': api.apiKey || '',
        'REGION': this.region || '',
        'IDENTITY_POOL_ID': identityPool.ref,
        'USER_POOL_ID': userPool.userPoolId,
        'USER_POOL_CLIENT_ID': userPoolClient.userPoolClientId,
      }
    })

    foodoApp.addBranch('main')

    // Create the VPC needed for the Aurora Serverless DB cluster
    const foodoVpc = new ec2.Vpc(this, 'FoodoVPC', {
      cidr: '10.0.0.0/20',
      natGateways: 0,
      maxAzs: 2,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          cidrMask: 22,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 22,
          name: 'private',
          subnetType: ec2.SubnetType.ISOLATED,
        },
      ],
    })

    // Create the required security group
    const privateSg = new ec2.SecurityGroup(this, 'foodo-private-sg', {
      vpc: foodoVpc,
      securityGroupName: 'foodo-private-sg',
    })

    privateSg.addIngressRule(
      privateSg,
      ec2.Port.allTraffic(),
      'allow internal SG access'
    )

    // Fetch the latest Ubuntu AMI
    // const ami = new ec2.LookupMachineImage({
    //   name: 'ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*',
    //   filters: { 'virtualization-type': ['hvm'] },
    //   // Canonical AWS Account ID
    //   owners: ['099720109477'],
    // })

    // EC2 instance and public Security Group
    const publicSg = new ec2.SecurityGroup(this, 'foodo-public-sg', {
      vpc: foodoVpc,
      securityGroupName: 'foodo-public-sg',
    })

    publicSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'allow SSH access'
    )

    privateSg.addIngressRule(
      publicSg,
      ec2.Port.tcp(5432),
      'allow Aurora Serverless Postgres access'
    )

    // new ec2.Instance(this, 'jump-box', {
    //   vpc: foodoVpc,
    //   securityGroup: publicSg,
    //   vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    //   instanceType: ec2.InstanceType.of(
    //     ec2.InstanceClass.T2,
    //     ec2.InstanceSize.MICRO
    //   ),
    //   machineImage: ec2.MachineImage.genericLinux({
    //     [this.region]: ami.getImage(this).imageId,
    //   }),
    //   keyName: this.node.tryGetContext('keyName'),
    // })

    // RDS Subnet Group
    const subnetGroup = new rds.SubnetGroup(this, 'foodo-rds-subnet-group', {
      vpc: foodoVpc,
      subnetGroupName: 'foodo-aurora-subnet-group',
      vpcSubnets: { subnetType: ec2.SubnetType.ISOLATED },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      description: 'An all private subnets group for the DB',
    })

    // Create the Serverless Aurora DB cluster
    const foodoCluster = new rds.ServerlessCluster(this, 'FoodoCluster', {
      engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
      // Set the engine to Postgres
      parameterGroup: rds.ParameterGroup.fromParameterGroupName(
        this,
        'ParameterGroup',
        'default.aurora-postgresql10'
      ),
      defaultDatabaseName: 'FoodoDB',
      enableDataApi: true,
      vpc: foodoVpc,
      subnetGroup,
      securityGroups: [privateSg],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // Create the Lambda function that will map GraphQL operations into Postgres
    const foodoLambda = new lambdaNode.NodejsFunction(this, 'FoodoService', {
      vpc: foodoVpc,
      vpcSubnets: { subnetType: ec2.SubnetType.ISOLATED },
      securityGroups: [privateSg],
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: 'lambda-fns/index.ts',
      handler: 'server',
      memorySize: 1024,
      timeout: cdk.Duration.seconds(10),
      environment: {
        SECRET_ID: foodoCluster.secret?.secretArn || '',
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      },
      bundling: {
        nodeModules: ['@prisma/client', 'prisma'],
        externalModules: ['aws-sdk', 'crypto'],
        commandHooks: {
          beforeBundling(_inputDir: string, _outputDir: string) {
            return []
          },
          beforeInstall(inputDir: string, outputDir: string) {
            return [`cp -R ${inputDir}/lambda-fns/prisma ${outputDir}/`]
          },
          afterBundling(_inputDir: string, outputDir: string) {
            return [
              `cd ${outputDir}`,
              `yarn prisma generate`,
              `rm -rf node_modules/@prisma/engines`,
              `rm -rf node_modules/@prisma/client/node_modules node_modules/.bin node_modules/prisma`,
            ]
          },
        },
      }
    })

    // Grant access to Secrets manager to fetch the secret
    foodoLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [foodoCluster.secret?.secretArn || ''],
      })
    )

    new ec2.InterfaceVpcEndpoint(this, 'foodo-secrets-manager', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      vpc: foodoVpc,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.ISOLATED },
      securityGroups: [privateSg],
    })

    // Grant access to the cluster from the Lambda function
    foodoCluster.grantDataApiAccess(foodoLambda)

    // Set the new Lambda function as a data source for the AppSync API
    const foodoDataSource = api.addLambdaDataSource('foodoDatasource', foodoLambda)

    // Map the resolvers to the Lambda function
    for (let { typeName, fieldName } of resolvers) {
      foodoDataSource.createResolver({ typeName, fieldName })
    }

    new cdk.CfnOutput(this, "GraphQLAPIURL", {
      value: api.graphqlUrl
    })

    new cdk.CfnOutput(this, 'AppSyncAPIKey', {
      value: api.apiKey || ''
    })

    new cdk.CfnOutput(this, 'Region', {
      value: this.region
    })

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId
    })

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId
    })
  }
}

const resolvers = [
  { typeName: 'Query', fieldName: 'listTodos' },
  { typeName: 'Query', fieldName: 'getTodoById' },
  { typeName: 'Mutation', fieldName: 'createTodo' },
  { typeName: 'Mutation', fieldName: 'updateTodo' },
  { typeName: 'Mutation', fieldName: 'deleteTodo' },
]
