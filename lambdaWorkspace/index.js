const AWS = require("aws-sdk"); // AWS SDK for accessing S3
const S3 = new AWS.S3(); // Initialize the S3 client
const sharp = require("sharp"); // Sharp for image transformation

const ORIGINAL_BUCKET = process.env.ORIGINAL_BUCKET; // Bucket with original images
const TRANSFORMED_BUCKET = process.env.TRANSFORMED_BUCKET; // Bucket to store transformed images
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const MIN_WIDTH = 10;
const MIN_HEIGHT = 10;

exports.handler = async (event) => {
  try {
    // Extract query parameters and image key from the request
    const queryString = event.queryStringParameters || {};
    const imageKey = event.pathParameters?.image; // The image filename from the URL
    // Validate the query parameters
    if (!imageKey) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Image key is required." }),
      };
    }
    console.log(queryString , "queryStrings")
    const width = parseInt(queryString.w, 10);
    const height = parseInt(queryString.h, 10);
    const quality = parseInt(queryString.q, 10) || 80; // Default quality is 80
    const isBlur = queryString.blur && queryString.blur === "true";
    const isGrey = queryString.grey && queryString.grey === "true";

  
    // Validate and normalize width and height
    if (isNaN(width) || width <= MIN_WIDTH || width > MAX_WIDTH) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: `Invalid or missing width (w) parameter. MIN = ${MIN_WIDTH} & MAX = ${MAX_WIDTH}`,
        }),
      };
    }

    if (isNaN(height) || height <= MIN_HEIGHT || height > MAX_HEIGHT) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: `Invalid or missing height (h) parameter. MIN = ${MIN_HEIGHT} & MAX = ${MAX_HEIGHT}`,
        }),
      };
    }

    if (quality < 1 || quality > 100) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Quality (q) parameter must be between 1 and 100.",
        }),
      };
    }

    // Generate a normalized transformed image key to ensure consistency
    const transformedImageKey = `${width}x${height}_q${quality}_${imageKey}_blur${isBlur}_grey${isGrey}`;

    // Step 1: Check if the transformed image already exists
    try {
      const transformedImage = await S3.getObject({
        Bucket: TRANSFORMED_BUCKET,
        Key: transformedImageKey,
      }).promise();

      // If the transformed image is found, return it as the response
      return {
        statusCode: 200,
        headers: { "Content-Type": "image/png" },
        body: transformedImage.Body.toString("base64"),
        isBase64Encoded: true,
      };
    } catch (err) {
      // If the image is not found, proceed to the next step
      if (err.code !== "NoSuchKey") {
        throw err; // Throw an error if it's not a 'NoSuchKey' error
      }
    }

    // Step 2: Retrieve the original image
    const originalImage = await S3.getObject({
      Bucket: ORIGINAL_BUCKET,
      Key: imageKey,
    }).promise();

    // Step 3: Transform the image using the Sharp library
    let transformObject = sharp(originalImage.Body)
      .resize(width, height, { fit: "fill", position: "center" })

    // Conditionally add blur
    if(isBlur){
        transformObject = transformObject.blur(5)
    }
    
    // Conditionally add greyscale
    if (isGrey) {
      transformObject = transformObject.greyscale(); // Add greyscale if isGrey is true
    }

    // Generate the transformed buffer
    const transformedBuffer = await transformObject.toBuffer();

    // Step 4: Save the transformed image
    await S3.putObject({
      Bucket: TRANSFORMED_BUCKET,
      Key: transformedImageKey,
      Body: transformedBuffer,
      ContentType: "image/png",
    }).promise();

    // Step 5: Return the transformed image
    return {
      statusCode: 200,
      headers: { "Content-Type": "image/png" },
      body: transformedBuffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error(err);

    // Return an error response for any unexpected errors
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};

