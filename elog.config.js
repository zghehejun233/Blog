const r2 = require("@elog/plugin-img-r2");

module.exports = {
  write: {
    platform: "notion",
    notion: {
      token: process.env.NOTION_TOKEN,
      databaseId: process.env.NOTION_DATABASE_ID,
      filter: { property: "status", select: { equals: "已发布" } },
    },
  },
  deploy: {
    platform: "local",
    local: {
      outputDir: "./source/_posts",
      filename: "title",
      format: "markdown",
      formatExt: "./formatter.js",
      frontMatter: {
        enable: true,
        include: [],
        exclude: ["urlname", "catalog"],
      },
    },
  },
  image: {
    enable: true,
    plugin: r2,
    r2: {
      accessKeyId: process.env.R2_ACCESSKEYID,
      secretAccessKey: process.env.R2_SECRET_ACCESSKEY,
      bucket: process.env.R2_BUCKET,
      endpoint: process.env.R2_ENDPOINT,
      host: process.env.R2_HOST,
      prefixKey: "blog/images/",
    },
  },
};
