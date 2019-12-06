import AndroidPublishHelper from "./AndroidPublishHelper";
import CookieCheckable from "./CookieCheckable";
const fs = require('fs');
const path = require("path");
export default class QQPublishHelper extends AndroidPublishHelper implements CookieCheckable{
    
    
    async checkCookieAlive(): Promise<boolean> {
        await this.refreshCookieFromZk();
        const result = await this.doRequest(this.getAsync, {
            url: "http://op.open.qq.com/manage_centerv2/get_ad_config",
            qs: {
                ad_type: "manage_center"
            },
        });
        let alive = false;
        try {
            const body = JSON.parse(result.body);
            if (body.code === 0) alive = true; 
        }catch{
            alive = false;
        }
        return alive;
    }
    
    
    getToken(skey: string) {
        for (var e = skey || "", n = 5381, t = 0, i = e.length; i > t; ++t)
            n += (n << 5) + e.charCodeAt(t);
        return 2147483647 & n
    }
    async publish(cn_name: string, en_name: string, package_name: string, project_version: string, desc: string, extra: any) {
        if (!await this.checkCookieAlive()) {
            throw new Error("请先登录");
        }
        const uin = await this.zk.getString("username");
        const result = await this.doRequest(this.getAsync, {
            url: "http://op.open.qq.com/manage_centerv2/android",
            qs: {
                owner: uin,
                uin: uin,
            },
        })
        const content = result.body;
        let dataStrArr = content.match(/G_DATA=.*?}(,|;)/)
        if (dataStrArr.length === 0) {
            throw new Error("没有找到应用列表")
        }
        let dataStr = dataStrArr[0].substring("G_DATA=".length, dataStrArr[0].length-1)
        const appList = JSON.parse(dataStr);
        const appMap = {};
        for (let key of Object.keys(appList)){
            appList[key].forEach(it => {
                it.status = key;
                appMap[it.app_alias] = it;
            })
        }
        const appId = appMap[cn_name].appid;
        const cookieMap = this.getCookieMap();
        const skey = cookieMap["skey"]
        const apkPath = this.getApkPath(en_name, project_version);
        const fileName = path.basename(apkPath);
        const fileStat = fs.statSync(apkPath);
        //更新安装包
        const uploadReq = await this.doRequest(this.postAsync, {
            url: "http://op.open.qq.com/mobile_api/apkupload",
            formData: {
                uin: uin,
                skey: skey,
                token: this.getToken(skey),
                appid: appId,
                name: apkPath,
                type: "application/vnd.android.package-archive",
                lastModifiedDate: new Date(fileStat.mtimeMs).toString(),
                size: fileStat.size,
                file: fs.createReadStream(apkPath),
            }
        })
        return true;
    }    
    
    getName(): string {
        return "qq";
        // throw new Error("Method not implemented.");
    }

    
}