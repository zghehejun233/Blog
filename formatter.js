// 0.12.0及以上版本用法
const { matterMarkdownAdapter } = require("@elog/cli");
const { log } = require("hexo/dist/plugins/helper/debug");

/**
 * 自定义文档插件
 * @param {DocDetail} doc doc的类型定义为 DocDetail
 * @param {ImageClient} imageClient 图床下载器，可用于图片上传
 * @return {Promise<DocDetail>} 返回处理后的文档对象
 */
const format = async (doc, imageClient) => {
  const cover = doc.properties.cover;

  // 将 cover 字段中的 notion 图片下载到本地
  if (imageClient && cover) {
    const url = await imageClient.uploadImageFromUrl(cover, doc);
    doc.properties.headimg = url;
    // 移除 cover 字段，防止重复上传
    delete doc.properties.cover;
  }

  doc.body = matterMarkdownAdapter(doc);
  return doc;
};

module.exports = {
  format,
};
