import AndroidPublishHelper from "./AndroidPublishHelper";
import CookieCheckable from "./CookieCheckable";
const fs = require('fs');
const cheerio = require('cheerio');
export default class VivoPublishHelper extends AndroidPublishHelper implements CookieCheckable{
    appMap = new Map<string, any>();
    //cookie有效期是session，我们保持心跳请求，保证服务器session不过期就可以一直存活。
    //除非对方服务器重启，并且session没有序列化。或者我们太久没有请求.
    async checkCookieAlive(): Promise<boolean> {
        await this.refreshCookieFromZk();
        const result = await this.doRequest(this.getAsync,{
            url: "https://dev.vivo.com.cn/webapi/app/page-list",
            qs: {
                currentPageNum: 1,
                cnName:"", //以下两个参数可以为空值，但不能不填
                appType:""
            }
        });
        let alive, body;
        try {
            body = JSON.parse(result.body);
            alive = body.data && body.code === 0 ? true : false; 
        }catch{
            alive = false;
        }
        if (alive) {
            const data = body.data.data;
            data.forEach(it=>{this.appMap.set(it["packageName"], it)})
        }
        return alive;
    }
    
    async publish(cn_name: string, en_name: string, package_name: string, project_version: string, desc: string, extra: any) {
        if (!await this.checkCookieAlive()) {
            throw new Error("请先登录");
        }
        // 1. 获取app信息    
        const vivoApp = this.appMap.get(package_name);
        if (!vivoApp){
            throw new Error(`没有找到到包名为${package_name}的应用`);
        }
        const appId = vivoApp["id"];
        const apkPath = await this.getApkPath(en_name, project_version);
        const verDesc = desc;
        if(!appId) throw new Error("没有找到到该应用");
        const appInfo = await this.doRequest(this.getAsync, {
            url: "https://developer.vivo.com.cn/application/manage/editApplicationPage",
            qs: {"appInfo.id": appId}
        })

        const data:any = {} 
        const $ = cheerio.load(appInfo.body);
        this.fillDataFromInput($, data);
        this.fillDataFromSelect($, data)
        this.fillDataFromTextarea($, data)

        data.operateType = data.operateType === 4 ? 3 : data.operateType;
        //2. 上传文件
        data.uploadify = fs.createReadStream(apkPath);
        Object.keys(data).forEach(key=>{
            if (!data[key]) data[key]=""
        })
        const uploadReq = await this.doRequest(this.postAsync, {
            url: 'https://developer.vivo.com.cn/upload/apk/application',
            qs: {
                appId: appId,
                operateType: data.operateType, 
                tokenVerify: data.tokenVerify
            },
            formData: data
        })
        const uploadResult = JSON.parse(uploadReq.body);
        if (uploadResult.code != 1){ //"1" == 1 true, "1" === 1 false
            throw new Error("上传失败: "+data.errorCodeMsg.errorMsg) 
        };
        const uploadResultObj = uploadResult.object;
        data.uuid = uploadResultObj["uuid"]
        data["appInfo.sensitivePermissionList"] = JSON.stringify(uploadResultObj.sensitivePermissionList)
        data["appInfo.sensitivePermissionParam"] = data["appInfo.sensitivePermissionList"]
        if (verDesc && verDesc.length > 0) data["appInfo.updateDes"] = verDesc;
        delete data["uploadify"]
        const submitReq = await this.doRequest(this.postAsync, {
            url: "https://developer.vivo.com.cn/application/manage/editApplication",
            formData: data
        });

        const submitResult = JSON.parse(submitReq.body);
        if (submitResult.code != 1) {
            throw new Error("提交审核失败: " + data.errorCodeMsg.errorMsg)
        }
        return true;
    }    
    
    getName(): string {
        return "vivo";
    }


}