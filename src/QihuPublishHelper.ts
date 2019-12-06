import AndroidPublishHelper from "./AndroidPublishHelper";
import AppPublish from "Zookeeper";
import CookieCheckable from "./CookieCheckable";
const cheerio = require('cheerio');
const fs = require('fs');
const path = require("path");
export default class QihuPublishHelper extends AndroidPublishHelper implements CookieCheckable{

    
    ZK_PREFIX="android_market.qihu";
    qid="2754327295"; //不知含义
    appMap=new Map<string, Map<string, any>>();
    constructor(zk: Zookeeper) {
        super(zk);
    }



    async checkCookieAlive(): Promise<boolean> {
        await this.refreshCookieFromZk();
        const result = await this.doRequest(this.getAsync, {
            url: 'http://dev.360.cn/mod3/mobile/Newgetappinfopage',
            qs: {
                "qid": this.qid, 
                "page": "1",
                "page_size": "12",
            }
        })
        let alive, data;
        try {
            data = JSON.parse(result.body).data as Array<Map<string, string>>;
            alive = data!= null;
        }catch(e){
            alive=false;
        }
        
        if (alive){
            data.list.forEach(r=> this.appMap.set(r["pname"], r));
        }
        
        return alive;
    }

    async getAppKey(appId: string) {
        const result = await this.doRequest(this.getAsync, {
            url: "http://dev.360.cn/mod3/home/",
            qs: {
                "qid": this.qid,
                "appid": appId
            }
        });
        const body = result.body;
        const lines = body.split("\n");
        for (let i=0; i < lines.length; i++){
            if (lines[i].indexOf("appkey")>-1) {
                const reuslt = lines[i+1].match(/[a-z0-9A-Z]{32}/)
                if (result.length>0) return result[0];
            }
        }
        return null;
    }

    getTagString(datas){
        return datas.map(data=>{
            if (Array.isArray(data)) return data.join(",")
            return data;
        }).join("|");
    }
    
    async publish(cn_name: string, en_name: string, package_name: string, project_version: string, desc: string, extra: any) {
        // await this.refreshCookieFromZk();
        if (!await this.checkCookieAlive()) {
            throw new Error("请先登录");
        }
        const packageName = package_name;
        if (!this.appMap.has(packageName)) await this.checkCookieAlive();
        const appInfo = this.appMap.get(packageName);
        if (!appInfo) throw new Error("在市场上找不到该应用");
        const appId = appInfo["appid"]
        const appKey = this.getAppKey(appId);
        if (!appKey) throw new Error("获取不到APPKey");
        //软件分类硬编码待完善，分类仅限软件（apptype=soft, tag=1)
        const result = await this.doRequest(this.getAsync, {
            url: 'http://dev.360.cn/mod3/createmobile/app',
            qs: {
                id: appId
            }
        });
        const $ = cheerio.load(result.body);
        const data = {};
        this.fillDataFromInput($, data);
        this.fillDataFromTextarea($, data);
        this.fillDataFromSelect($, data);
        data["timed_pub"] = 0 //立即发布 这个radio 没有被checked
        //还有一部分信息在js中
        const lines = result.body.split("\n"); 
        const informationInJS = 2;
        let tag=1; //1. 软件 2. 游戏 3. 电子书
        let tag1;
        let tag2;
        for (let i = 0, j = 0; i < lines.length && j < informationInJS; i++) {
            if (lines[i].indexOf("for_free = ") > -1) {
                const result = lines[i].match(/\d+/);
                if (result.length>0) data["is_free"] = result[0]
                j++;
            } else if (lines[i].indexOf('var key = ')>-1) {
                const result = lines[i].match(/"\d+":\d+,"\d+":\d+/);
                if (result.length>0) {
                    const arr = result[0].split(",");
                    const tags = result[0].replace(/[{}"]/g, '').split(/[,:]/);
                    tag1=tags[2];
                    tag2=tags[3];
                    data['tag1']=tags[0]+","+tags[1];
                    data['tag2']=tags[2]+","+tags[3];
                }
                j++;
            }
        }

        data["id"] = appId;
        data["apptype"] = "soft"; //不会有游戏吧
        if (desc && desc.length>0)
            data["edition_brief"] = desc//需要赋值
        const getFeatureTagResult = await this.doRequest(this.getAsync, {
            url: "http://dev.360.cn/mod/createmobile/GetFeaturetag",
            qs: {
                'appid': appId
            }
        })
        const featureTagBody = JSON.parse(getFeatureTagResult.body);
        if (featureTagBody.errno !== "0"){
            throw new Error("获取特性标签失败");
        }
        const featureOthers = featureTagBody.data.featuretag_selected.feature_other;
        const featureTags   = featureTagBody.data.featuretag_selected.feature_tag;
        data["feature_other"] = this.getTagString(featureOthers);
        data["feature_tag"] = this.getTagString(featureTags);
        //获取AppTag比较麻烦，先不处理， tag从html里获取（<label class="formtag">分类：</label> 找selected），tag1,tag2从js中获取 //Util.getTag('/createmobile/tagapi',2); 在js中设置selected
        const getAppTagResult = await this.doRequest(this.getAsync, {
            url: "http://dev.360.cn/mod/createmobile/GetApptag",
            qs: {
                'tag': tag,
                'tag1': tag1,
                'tag2': tag2,
                appid: appId
            }
        })
        const appTagBody = JSON.parse(getAppTagResult.body)
        if (appTagBody.errno !== "0") {
            throw new Error("获取应用标签失败");
        }
        data["common_tag"] = appTagBody.data.apptag_selected.common_tag.join(",")
        data["common_other"] = appTagBody.data.apptag_selected.common_other.join(",")
        const apkPath = await this.getApkPath(en_name, project_version);
        const fileName = path.basename(apkPath);
        const fileStat = fs.statSync(apkPath);
        const uploadResult = await this.doRequest(this.postAsync, {
            url: "http://upload.dev.360.cn/mod/upload/apk/",
            qs: {
                apptype: "soft",
                apkType: "Mobilecase",
                appid: appId,
                appkey: appKey,
                qid: this.qid
            },
            formData: {
                name: `${en_name}_latest.apk`,
                type: "application/vnd.android.package-archive",
                lastModifiedDate: new Date(fileStat.mtimeMs).toString(),
                size: fileStat.size,
                Filedata: fs.createReadStream(apkPath)
            }
        })

        const uploadResultBody = JSON.parse(uploadResult.body);
        if (uploadResultBody.status !== 0) {
            throw new Error("上传失败: " + uploadResultBody.error)
        }

        //新的上传文件信息
        for (let key in uploadResultBody.data) {
            if (key in data) {
                const value = uploadResultBody.data[key]
                if (!value) continue
                if (key === "sensitive_permission") {
                    data[key] = Object.keys(value).join(",")
                } else {
                    data[key] = value;
                }
            }
        }
        const submitResult = await this.doRequest(this.postAsync, {
            url: "http://dev.360.cn/mod3/createmobile/submit",
            formData: data
        })
        const submitResultBody = JSON.parse(submitResult.body);
        if (submitResultBody.errno !== '0') {
            throw new Error("审核失败: "+submitResultBody.erro)
        }
        return true;
    }    
    
    getName(): string {
        return "qihu";
    }

    
}