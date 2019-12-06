import AndroidPublishHelper from "./AndroidPublishHelper";
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');
export default class SogouPublishHelper extends AndroidPublishHelper {
    

    getToken() {
        function e() {
            return Math.floor((1 + Math.random()) * 65536).toString(16).substring(1)
        }
        return e() + e() + e() + e() + e() + e() + e() + e()
    }
    ZK_PREFIX = "android_market.sogou";
    async login(){
        const result = await this.postAsync({
            url: "https://account.sogou.com/web/login",
            formData: {
                username: await this.zk.getString(`${this.ZK_PREFIX}.username`),
                password: await this.zk.getString(`${this.ZK_PREFIX}.password`),
                autoLogin: 1,
                xd: 'http://zhushou.sogou.com/open/jump.html',
                client_id: 1199,
                token: this.getToken()
            }
        });
        const cookies = result.headers["set-cookie"];
        if (cookies && cookies.length>0) {
            this.cookie=cookies.map(it=> it.split(";")[0]).join(";")
        } else {
            throw new Error("登录失败");
        }
    }

    async publish(cn_name: string, en_name: string, package_name: string, project_version: string, desc: string, extra: any) {
        const verDesc = desc;
        const apkPath = await this.getApkPath(en_name, project_version);
        const fileName = path.basename(apkPath);
        await this.login(); //测试中不要频繁登录
        //1.拉取应用列表，找到appId
        const appList = await this.doRequest(this.getAsync, {
            url: "http://zhushou.sogou.com/open/user/app/index.html"
        });
        let $ = cheerio.load(appList.body)
        // console.log(appList);
        const appNameNodes = $('div[class=info-con]').find('span[class=name]');
        const appIdNodes = $('div[class=info-con]').find('span[class=appid]');
        const appNames = [];
        const appIds = [];
        for (let i = 0; i < appNameNodes.length; i++) {
            appNames.push(appNameNodes[i].firstChild.data);
        }
        for (let i = 0; i < appIdNodes.length; i++) {
            appIds.push(appIdNodes[i].firstChild.data.split(/\s+/)[1]) //AppId 88481
        }
        const appName = cn_name;
        const idx = appNames.findIndex(it=>it===appName);
        if (idx === -1 || idx >= appIds.length) throw new Error("没有找到该应用")
        const appId = appIds[idx];
        //解析完获取到appId
        //2. 获取到app基础信息
        const appInfoReq = await this.doRequest(this.getAsync, {
            url: "http://zhushou.sogou.com/open/app/update.html",
            qs: {
                id: appId
            }
        });
        // const html = fs.readFileSync('sogou_update.html')
        const data = {}
        $ = cheerio.load(appInfoReq.body);
        // $=cheerio.load(html)
        this.fillDataFromInput($, data)
        this.fillDataFromSelect($, data)
        this.fillDataFromTextarea($, data)
        if (Object.keys(data).length === 0) {
            let msg = appInfoReq.body.indexOf("审核中") > -1 ? "应用正在审核中" : "获取应用基础信息失败";
            throw new Error(msg);
        }
        data["changelog"]=(verDesc&&verDesc.length>0) ? verDesc : data["update_info"];
        data["file_icon"]=$('div.icon').find('img')[0].attribs.src;
        data["label"] = $('div.labels').find('input[type="hidden"]')[0].attribs.value
        const tagInputs = $('div.tags').find('input[type="hidden"]');
        const tags=[];
        for (let i =0; i< tagInputs.length;i++){
            tags.push(tagInputs[i].attribs.value)
        }
        data["tags[]"] = tags
        delete data["versioncode"]
        if (!("qualification[]" in data )) {
            data["qualification[]"] = ""
        }
        data["type"] = 0;//这个type应该是文件相关的，不知道是不是指的文件类型，都先统一为0
        //3. 上传文件
        const fileStat = fs.statSync(apkPath);
        const uploadReq = await this.doRequest(this.postAsync, {
            url: "http://zhushou.sogou.com/open/",
            qs: {
                route: "upload.app",
                rand: new Date()
            },
            formData: {
                name: fileName,
                type: "application/vnd.android.package-archive",
                lastModifiedDate: new Date(fileStat.mtimeMs).toString(),
                size: fileStat.size,
                Filedata: fs.createReadStream(apkPath),
                auth_sid: data["auth_sid"],
                uid: data["user_id"],
                token: data["token"],
            }
        })
        const uploadReqBody = JSON.parse(uploadReq.body);
        if (!uploadReqBody.file_id) throw new Error("上传失败:"+uploadReqBody.msg);
        data["file_id"] = uploadReqBody.file_id
        //4. 提交
        const submitReq = await this.doRequest(this.postAsync, {
            url: "http://zhushou.sogou.com/open/app/update.html",
            qs: {
                id: appId
            },
            formData: data
        })
        if (submitReq.status != 200) {
            throw new Error("提交审核失败");
        }
        return true;
    }    
    
    getName(): string {
        return "sogou";
    }

    
}