import { Zookeeper } from "ZooKeeper";

// import request from 'request';
// import util from 'util';
const request = require('request')
const util = require('util');
export default abstract class AndroidPublishHelper {
    zk: Zookeeper;
    cookie: string;
    getAsync;
    postAsync;
    putAsync;
    constructor(zookeeper: Zookeeper) {
        this.zk = zookeeper;
        this.cookie = "";
        this.postAsync = util.promisify(request.post);
        this.getAsync = util.promisify(request.get);
        this.putAsync = util.promisify(request.put);
    }

    protected getCookiePathInZk(){
        return `android_market.${this.getName()}.cookie`;
    }
    protected async refreshCookieFromZk(): Promise<string>{
        this.cookie = await this.zk.getString(this.getCookiePathInZk());
        return this.cookie;
    }
    // WARN: cookie需要事先被设置好
    protected async doRequest(req, config){
        return await req({
            ...config,
            headers: {"Cookie": this.cookie}
        })
    }

    /**
     * 
     * @param cn_name 应用的中文名称
     * @param en_name 应用的英文名称
     * @param package_name 应用的包名
     * @param project_version 应用本次发布的版本号
     * @param desc 应用本次发布的描述
     * @param extra 
     */
    abstract async publish(cn_name: string, en_name: string, package_name: string, project_version: string, desc: string, extra: any): Promise<boolean>;

    abstract getName(): string;

    /**
     * 
     * @param en_name 应用的英文名称
     * @param project_version 应用的版本号
     */
    async getApkPath(en_name: string, project_version: string): Promise<string>{
        return await this.zk.getString(`android_market.apk_path`) + `/${this.getName()}/${en_name}_${project_version}.apk`
    }

    setData(key, value, data) {
        //数组的处理
        if (data[key]) {
            if(!Array.isArray(data[key])) {
                data[key] = [data[key]]
            } 
            data[key].push(value)
        } else {
            data[key]=value
        }
    }

    async fillDataFromInput($: any, data: any){
        const inputArr = $('input'); //[type="hidden"]
        for (let i=0; i < inputArr.length; i++){
            const input = inputArr[i];
            const attribs = input.attribs;
            if (!attribs.name || attribs.name === "undefined") continue
            if (attribs.type==='radio' && !("checked" in attribs)) {
                continue
            }

            this.setData(attribs.name, attribs.value, data);
        }
    }


    async fillDataFromTextarea($: any, data: any) {
        const textareaArr = $('textarea');
        for (let i = 0; i < textareaArr.length; i++) {
            const textarea = textareaArr[i];
            const attribs = textarea.attribs;
            if (!attribs.name || attribs.name === "undefined") continue
      
            let value = ''
            if (textarea.childNodes.length>0) {
                value = textarea.childNodes[0].data
            } 
            this.setData(attribs.name, value, data)
        }
    }

    async fillDataFromSelect($: any, data: any) {
        const selectArr = $('select')
        for (let i = 0; i < selectArr.length; i++) {
            const select = selectArr[i];
            if (!select.attribs.name || select.attribs.name === "undefined") continue
            const selectedOptions = select.childNodes.filter(node=>node.name==="option" && node.attribs.selected==="selected");
            
            let value;
            if (selectedOptions.length === 0) {
                value = select.attribs.value || select.attribs["data-value"]
                if (value === undefined) continue
            } else {
                const selectedOption = selectedOptions[0];
                value = selectedOption.attribs.value
            }
            
         
            this.setData(select.attribs.name, value, data)
        }
    }


    async setCookie(response){
        if (!response.headers || ! response.headers["set-cookie"]) return;
        const s = response.headers["set-cookie"].find(s=>s.startsWith("JSESSIONID"))
        if (!s) return;
        const ss = s.split(";");
        if (ss.length === 0) return;
        const newCookie = ss[0];
        if (newCookie !== this.cookie) { //应该不会去刷新cookie
            this.cookie = newCookie;
            this.zk.setData(this.getCookiePathInZk(), newCookie, false);
        }
    }

    async getCookieMap(){
        const cookieMap = {};
        const arr1=this.cookie.split(/\s*;\s*/);
        arr1.forEach(it=>{
            const arr2=it.split(/\s*=\s*/)
            if (arr2.length < 2) return
            cookieMap[arr2[0]]=arr2[1]
        })
        return cookieMap;
    }
}