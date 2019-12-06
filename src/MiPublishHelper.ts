import AndroidPublishHelper from "./AndroidPublishHelper";

import { Zookeeper } from "ZooKeeper";

const fs = require('fs');
const crypto = require('crypto');

export default class MiPublishHelper extends AndroidPublishHelper {
    getName(): string {
        return "mi";
    }

    ZK_PREFIX = "android_market.mi";
    encryptGroupSize=(1024/11)-11;
    publicKey:string ;
    MI_DOMAIN = "http://api.developer.xiaomi.com/devupload";

    async encryptContent(content: string){
        if (!this.publicKey) {
            this.publicKey = await this.zk.getString(`${this.ZK_PREFIX}.publicKey`)
        }
        let sig = ''
        for (let i = 0; i < content.length; ){
            const remain = content.length - i;
            const segSize = remain > this.encryptGroupSize ? this.encryptGroupSize : remain;
            const segment = content.substring(i, i+segSize)
            const r1 = crypto.publicEncrypt({key: this.publicKey, padding: crypto.constants.RSA_PKCS1_PADDING}, Buffer.from(segment)).toString('hex');
            sig+=r1;
            i = i + segSize;
        }
        return sig;
    }

    async publish(cn_name: string, en_name: string, package_name: string, project_version: string, desc: string, extra: any) {
        const userName = await this.zk.getString(`${this.ZK_PREFIX}.username`)
        const privateKey = await this.zk.getString(`${this.ZK_PREFIX}.private_key`) 
        const requestData = {
            "userName": userName,
            "synchroType": 1,
            "appInfo": {
                "appName": cn_name,
                "packageName": package_name,
                "updateDesc": desc
            }
        }
        const requestDataStr = JSON.stringify(requestData);
        const paramsMd5Arr = [];
        const apkPath = await this.getApkPath(en_name, project_version);
        const buffer = fs.readFileSync(apkPath);
        const fsHash = crypto.createHash('md5').update(buffer).digest('hex')
        const fileStream = fs.createReadStream(apkPath)
        paramsMd5Arr.push({"name": "RequestData", "hash": crypto.createHash('md5').update(requestDataStr).digest('hex')});
        paramsMd5Arr.push({"name": "apk", "hash": fsHash});
        const result = await this.postAsync({
            "url": this.MI_DOMAIN + "/dev/push",
            "formData": {
                "RequestData": requestDataStr,
                "apk": fileStream,
                "SIG": await this.encryptContent(JSON.stringify({"sig": paramsMd5Arr, "password": privateKey}))
            }
        });

        if (result.body.result) {
            throw new Error(`发布失败: ${result.body.message}`)
        }
    
        
        return true;
    }

}