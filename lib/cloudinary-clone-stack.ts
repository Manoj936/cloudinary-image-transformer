import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class CloudinaryCloneStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //1️⃣. Create source S3 bucket

    const SourceBucket = new cdk.aws_s3.Bucket(this, "cloudinaryclnsrc890", {
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    //2️⃣. Create Destination S3 bucket

    const DistBucket = new cdk.aws_s3.Bucket(this, "cloudinaryclndist890", {
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30), // Delete objects after 30 days from transformed images
          enabled: true,
        },
      ],
    });
    //3️⃣. Create lambda function
    const TransformerLambdaFunction = new cdk.aws_lambda.Function(
      this,
      "cloudinaryclnlambda",
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(20),
        architecture: cdk.aws_lambda.Architecture.X86_64,
        code: cdk.aws_lambda.Code.fromAsset("lambdaWorkspace"),
        handler: "index.handler",
        environment: {
          ORIGINAL_BUCKET: SourceBucket.bucketName,
          TRANSFORMED_BUCKET: DistBucket.bucketName,
        },
      }
    );

    //4️⃣. Grant Lambda Permissions to Access S3 Buckets

    SourceBucket.grantRead(TransformerLambdaFunction);
    DistBucket.grantReadWrite(TransformerLambdaFunction);

    //5️⃣. Create API gateway and connect to the lambda

    const httpApi = new cdk.aws_apigatewayv2.HttpApi(this, "cloudinaryclnAPI", {
      apiName: "cloudinarytransformerApi",
      description: "HTTP API Gateway for Image Transformation Lambda",
      createDefaultStage: true,
    });
    // ✅ Define API Gateway Resource & Method

    const lambdaIntegration =
      new cdk.aws_apigatewayv2_integrations.HttpLambdaIntegration(
        "LambdaIntegration",
        TransformerLambdaFunction
      );

    httpApi.addRoutes({
      path: "/{image}",
      methods: [cdk.aws_apigatewayv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    TransformerLambdaFunction.addPermission("HttpApiInvoke", {
      principal: new cdk.aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${httpApi.httpApiId}/default/*`,
    });
    // 5️⃣ CloudFront Distribution (CDN for API Gateway)
    const distribution = new cdk.aws_cloudfront.Distribution(
      this,
      "MyCloudFront",
      {
        defaultBehavior: {
          origin: new cdk.aws_cloudfront_origins.HttpOrigin(
            `${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`
          ),
          allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: new cdk.aws_cloudfront.CachePolicy(
            this,
            "CachePolicyWithQueryParams",
            {
              queryStringBehavior: cdk.aws_cloudfront.CacheQueryStringBehavior.all(), // Cache based on all query strings
              headerBehavior: cdk.aws_cloudfront.CacheHeaderBehavior.none(), 
              cookieBehavior: cdk.aws_cloudfront.CacheCookieBehavior.none(), 
            }
          ),
        },
      }
    );

    // 6️⃣✅ Output API Gateway & CloudFront URLs
    new cdk.CfnOutput(this, "HttpApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.domainName}`,
    });
  }
}
