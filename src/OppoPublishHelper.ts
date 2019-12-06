import AndroidPublishHelper from "./AndroidPublishHelper";
import CookieCheckable from "./CookieCheckable";
const fs = require('fs');
const path = require("path");
const cheerio = require('cheerio');
export default class OppoPublishHelper extends AndroidPublishHelper implements CookieCheckable {
    async checkCookieAlive(): Promise<boolean> {
        await this.refreshCookieFromZk();
        const result = await this.doRequest(this.getAsync, {
            url: "https://open.oppomobile.com/user/index/check-login.json"
        });
        let alive = false;
        try {
            const body = JSON.parse(result.body);
            if (body.data && body.errno === 0) alive = true;
        } catch(e){}
        return alive;
    }

    appMap = new Map<string, Map<string, any>>();

    async listApp() {
        const result = await this.doRequest(this.postAsync, {
            url: "https://open.oppomobile.com/resource/list/index.json",
            formData: {
                type: 0,
                limit: 20,
                offset: 0,
                app_name: "",
                state: ""
            }
        });
        const body = JSON.parse(result.body);
        body.data["app_list"].data.rows.forEach(it => this.appMap.set(it.pkg_name, it))
    }
    
    async publish(cn_name: string, en_name: string, package_name: string, project_version: string, desc: string, extra: any) {
        if (!await this.checkCookieAlive()) {
            throw new Error("请先登录");
        }
        //1. 先获取app_id
        //appMap[pkg_name]["app_id"]
        const verDesc = desc;
        await this.listApp();
        const appId=this.appMap.get(package_name)["app_id"];
        if (!appId) throw new Error("找不到该应用");
        const apkPath = await this.getApkPath(en_name, project_version);
        const fileName = path.basename(apkPath);
        //2. 获取app信息
        const data = {};
        const appInfo = await this.doRequest(this.getAsync, {
            url: "https://open.oppomobile.com/resource/publish",
            qs: {
                app_id: appId
            }
        });
        const $ = cheerio.load(appInfo.body)
        this.fillDataFromInput($, data);
        this.fillDataFromTextarea($, data);
        this.fillDataFromSelect($, data);
        if (Object.keys(data).length === 0) throw new Error("不存在该应用基础信息");
        if (verDesc && verDesc.length > 0) data["update_desc"] = verDesc;

        //3.上传app
        const uploadResult = await this.doRequest(this.postAsync, {
            url: "https://api.open.oppomobile.com/api/utility/upload",
            qs: {
                id: 0, 
                filename: fileName
            },
            formData: {
                file: fs.createReadStream(apkPath),
                type: 'apk',
                id: 0
            }
        });
        const uploadBody = JSON.parse(uploadResult.body);
        if (uploadBody.errno !== 0) throw new Error("上传失败");
        const uploadData = uploadBody.data;
        data["apk_md5"] = uploadData["md5"]
        data["apk_url"] = uploadData["url"];

        //4. 获取apk信息
        const appCheckReq = await this.doRequest(this.postAsync, {
            url: "https://open.oppomobile.com/resource/publish/checkapp",
            formData: {
                apk_url: data["apk_url"],
                version_operation_type: data["version_operation_type"],
                app_id: appId,
            }
        })
        const appCheckBody = JSON.parse(appCheckReq.body);
        if (appCheckBody.errno) throw new Error("检查APK包失败："+appCheckBody.data.message)
        const appCheckData = appCheckBody.data;
        const replacedKey = ["app_name", "pkg_name", "apk_size", "min_sdk_version", "target_sdk_version","version_name", "version_code", "header_md5", "apk_md5", "sign"];
        replacedKey.forEach(it=> {
            data[it] = appCheckData[it]
        });
        
        ["package_permission", "package_permission_desc"].forEach(it=>{
            data[it]=appCheckData[it].join(",")
        })
        data["version_id"] = ""

        //提交审核
        const submitResult = await this.doRequest(this.postAsync, {
            url: "https://open.oppomobile.com/resource/update/index",
            formData: data
        });

        const submitResultBody = JSON.parse(submitResult.body);
        if (submitResultBody.errno !== 0) {
            throw new Error("审核失败" + submitResultBody.data.message)
        }
        return true;
    }    
    
    
    getName(): string {
        return "oppo";
    }

    
}