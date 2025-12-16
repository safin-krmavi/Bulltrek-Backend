import multer from "multer";
import multerS3 from "multer-s3";
import AWS from "aws-sdk";

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

export const s3KycUpload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET as string,
    acl: "public-read",
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      const ext = file.originalname.split(".").pop();
      const unique = `${Date.now()}-${Math.random() * 10000}.${ext}`;

      cb(null, `bulltrek/kyc-documents/${unique}`);
    },
  }),
});
