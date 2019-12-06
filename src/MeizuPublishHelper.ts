import AndroidPublishHelper from "./AndroidPublishHelper";
import CookieCheckable from "./CookieCheckable";
const fs = require('fs');
const moment = require('moment')
export default class MeizuPublishHelper extends AndroidPublishHelper implements CookieCheckable {

    appMap = new Map<string, Map<string, any>>();



    //cookie有效期是session，我们保持心跳请求，保证服务器session不过期就可以一直存活。
    //除非对方服务器重启，并且session没有序列化。或者我们太久没有请求.
    async checkCookieAlive(): Promise<boolean> {
        const cookie = await this.refreshCookieFromZk();
        // console.log(this.getName(), cookie);
        const getResponse = await this.doRequest(this.getAsync, {
            url: "http://developer.meizu.com/console/apps/app/list/data",
            qs: {
                //懒得去抓取所有数据了，预计一个公司的app不会的需求不会超过10条，除外包公司以外。
                "start": 0,
                "limit": 10
            }
        })
        let alive ;
        let result;
        try {
            result = JSON.parse(getResponse.body);
            alive = result.code === 200;
        }catch(e){
            alive=false;
        }

        if (alive) {
            const data = result.value.data;
            data.forEach(it=>{this.appMap.set(it["name"], it)})
            // this.appMap.set(data["name"], data)
            this.setCookie(getResponse)
        } 
        return alive;
    }

    async publish(cn_name: string, en_name: string, package_name: string, project_version: string, desc: string, extra: any) {
        if (!await this.checkCookieAlive()) {
            throw new Error("请先登录");
        }
        //1. 上传apk包
        const uploadResult = await this.doRequest(this.postAsync, {
            url: "http://developer.meizu.com/console/apps/upload/chain",
            formData: {
                "Filedata": fs.createReadStream(await this.getApkPath(en_name, project_version))
            }
        })
        const uploadResultBody = JSON.parse(uploadResult.body);
        if (uploadResultBody.code !== 200) {
            throw new Error("上传失败: "+ uploadResultBody.message);
        }
        this.setCookie(uploadResult);
        const uploadResultData = uploadResultBody.value[0];
        const meizuBean = new MeizuBean();
        
        
        //2. 获取app信息
        const appInfoReq = await this.doRequest(this.getAsync,{
            url: "http://developer.meizu.com/console/apps/appinfo.json",
            qs: {
                package_name: package_name
            }
        })
        const appInfoBoby = JSON.parse(appInfoReq.body);
        if (appInfoBoby.code !== 200) throw new Error("获取APP信息失败: " + appInfoBoby.message)
        const appInfo = appInfoBoby.value;
        this.setCookie(appInfoReq)

        const keyPairs={"appName": "name", "appDesc": "appDescription", "verDesc": "verDescription",
                        "authorName": "publisher", "catid": "categoryId", "cat2id": "category2Id" }
        
        for (let key of Object.keys(meizuBean)) {
            let value;
            if (key in keyPairs) {
                value = appInfo[keyPairs[key]]
            } else {
                value = appInfo[key];
            }
            if (typeof value === 'boolean') {
                value = value ? 1 : 0;
            }
            
            if (value === undefined || value === null) value = '' 
            else if (key === "saleTime" || key === "warnTime" || key === "betaTime" || key === "betaEndTime") {
                value = moment(new Date(value)).format('YYYY-MM-DD HH:mm:ss')
            }
            meizuBean[key] = value;
            // if (!value) value = "";
        }
        meizuBean.packageUrl = "/upload/"+uploadResultData.url
        const verDesc = desc;
        if (verDesc && verDesc.length > 5) meizuBean.verDesc = verDesc;
        meizuBean.screenShots=appInfo.images.map(it=>it.image)
        meizuBean.submitType = "publish";
        meizuBean.unionVersion=0;//联合运营

        //3. 提交审核
        const submitResult = await this.doRequest(this.postAsync, {
            url: 'http://developer.meizu.com/console/apps/save.json',
            formData: meizuBean
        })
        const submitResultBody = JSON.parse(submitResult.body);
        if (submitResultBody.code !== 200) {
            throw new Error("提交审核出错: " + submitResultBody.message)
        }
        this.setCookie(submitResult)
        return true;
    }

    getName(): string {
        return "meizu";
    }

    
    
}

class MeizuBean{
    id = undefined;
    verisonId = undefined;
    packageUrl = undefined;
    appName = undefined;
    unionVersion = undefined;
    appDesc = undefined;
    verDesc = undefined;
    recommendDesc = undefined;
    catid = undefined;
    cat2id = undefined;
    tagId = undefined;
    keyword = undefined;
    price = undefined;
    notifyUrl = undefined;
    authorName = undefined;
    testAccount = undefined;
    testPassword = undefined;
    icon = undefined;
    screenShots = undefined;
    enableSaleTime = undefined;
    saleTime = undefined;
    enableWarnTime = undefined;
    warnTime = undefined;
    enableBetaTime = undefined;
    betaTime = undefined;
    enableBetaEndTime = undefined;
    betaEndTime = undefined;
    locale = undefined;
    enablePurchase = 0 ;
    appNotifyUrl = "" ;
    submitType = "publish";
}