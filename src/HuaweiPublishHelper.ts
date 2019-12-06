import AndroidPublishHelper from "./AndroidPublishHelper";
const NodeRSA = require("node-rsa");
const fs = require('fs');
const xmlParser = require("fast-xml-parser");
const path = require("path")

export default class HuaweiPublishHelper extends AndroidPublishHelper {
    
    getName(): string {
        return "huawei";
    }
    ZK_PREFIX = "android_market.huawei";

    private client_id;
    private token;

    protected async doRequest(req, config){
        return await req({
            ...config,
            headers: {
                "Authorization": "Bearer " + this.token,
                "client_id": this.client_id
            }
        })
    }

    private checkError(result: any, msg: string) {
        if (!result.body) {
            throw new Error(msg);
        }
        if (result.body.errorCode) {
            throw new Error(`${msg}: ${result.body.errorMsg}`)
        }
    }

    private async initToken() {
        const domain = "https://connect-api.cloud.huawei.com/api"
        this.client_id = await this.zk.getString(`${this.ZK_PREFIX}.client_id`);
        const client_secret = await this.zk.getString(`${this.ZK_PREFIX}.client_secret`);
        const result = await this.postAsync({
            url: domain+"/oauth2/v1/token",
            json: {
                "client_id": this.client_id,
                "client_secret": client_secret,
                "grant_type": "client_credentials"
            }
        });
        this.token = result.body.access_token
    }

    /**
     * Deprecate
     * 华为的cookie不是存储在zk里，因此不要调用initCookie
     * @param app 
     */
    private async connect(){
        const clientId = await this.zk.getString(`${this.ZK_PREFIX}.clientId`);
        const priKey = await this.zk.getString(`${this.ZK_PREFIX}.priKey`)
        const currentTimestamp = Date.now();
        const content = clientId+currentTimestamp

        const key = new NodeRSA();
        key.importKey(Buffer.from(priKey, 'base64'), 'pkcs8-der');
        const privateKey = key.exportKey();
        const sign = new NodeRSA(privateKey, {signingSchema: 'sha256'}).sign(content).toString('base64');
        
        const result = await this.doRequest(this.postAsync,{
            url: "https://connect-api.cloud.huawei.com/api/common/v1/connect",
            json: {
                "key_string": {
                    "clientId": clientId,
                    "time": currentTimestamp,
                    "sign": sign
                }
            }
        });
        this.checkError(result, "登录失败")
 
        this.cookie = result.headers["set-cookie"][0]

    }

    /**
     * 
     * @param package_name 应用包名
     */
    private async getAppId(package_name: String){
        const appIdReq = await this.doRequest(this.getAsync, {
            url: "https://connect-api.cloud.huawei.com/api/publish/v2/appid-list",
            qs: {
                "packageName": package_name
            }
        });
        const appIdBody = JSON.parse(appIdReq.body);
        if (appIdBody.ret.code !== 0) {
            throw new Error("获取APPID失败:"+appIdBody.ret.msg)
        }
        const appId = appIdBody.appids[0].value
        return appId
    }


    public async publish(cn_name: string, en_name: string, package_name: string, project_version: string, desc: string, extra: any){
        //1. 登录
        await this.initToken();

        //4. 获取appId
        const appId = await this.getAppId(package_name);

        //2. 获取上传文件认证码
        const uploadReq = await this.doRequest(this.getAsync, {
            url: "https://connect-api.cloud.huawei.com/api/publish/v2/upload-url",
            qs: {"suffix": "apk", "appId": appId}
        });
        const uploadReqBody = JSON.parse(uploadReq.body)
        if (uploadReqBody.ret.code !== 0){
            throw new Error("获取文件上传信息失败: " + uploadReqBody.ret.msg);
        }
        const uploadAuthCode = uploadReqBody.authCode;
        const uplaodUrl = uploadReqBody.uploadUrl;
        
        //3. 上传文件
        const apkPath = await this.getApkPath(en_name, project_version);
        const uploadFileReq = await this.doRequest(this.postAsync, {
            url: uplaodUrl,
            formData: {
                authCode: uploadAuthCode,
                fileCount: 1,
                file: fs.createReadStream(apkPath)
            }
        });
        const uploadFileBoby = JSON.parse(uploadFileReq.body).result.UploadFileRsp;

        if (!uploadFileBoby.ifSuccess) throw new Error("文件上传失败");
        const fileInfoList = uploadFileBoby.fileInfoList;
        fileInfoList[0]["fileName"] = path.basename(apkPath)
        fileInfoList[0]["fileDestUrl"] = fileInfoList[0]["fileDestUlr"] //？？是接口的typo????

        //4. 更新应用语言描述信息
        const lang = "zh-CN";
        const updateAppReleaseInfoResult = await this.doRequest(this.putAsync, {
            url: 'https://connect-api.cloud.huawei.com/api/publish/v2/app-language-info',
            qs: {
                "appId": appId, 
            },
            json: {
     
                "lang": lang,
                "newFeatures": desc

                
            }
        });
        const updateAppReleaseInfoBody = updateAppReleaseInfoResult.body;
        if (updateAppReleaseInfoBody.ret.code !== 0) {
            throw new Error("更新描述失败: "+updateAppReleaseInfoBody.ret.msg);
        }
       
        //5.更新文件信息

        const updateAppFileResult = await this.doRequest(this.putAsync, {
            url: "https://connect-api.cloud.huawei.com/api/publish/v2/app-file-info",
            qs: {
                "appId": appId
            },
            json: {
                lang: lang,
                fileType: 5,
                files: fileInfoList
            }
        })
        const updateAppFileBody = updateAppFileResult.body
        if (updateAppFileBody.ret.code !== 0) {
            throw new Error("更新文件失败: "+updateAppFileBody.ret.msg);
        }
        
    
        //6. 提交审核
        const submitResult = await this.doRequest(this.postAsync, {
            url: "https://connect-api.cloud.huawei.com/api/publish/v2/app-submit",
            qs: {"appId": appId}
        })
        const submitBody = JSON.parse(submitResult.body)
        if (submitBody.ret.code !== 0) {
            throw new Error("提交审核失败: "+submitBody.ret.msg);
        }
        
        return true;
    }

    
}