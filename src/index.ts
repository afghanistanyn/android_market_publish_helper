import HuaweiPublishHelper from "./HuaweiPublishHelper";
import MeizuPublishHelper from "./MeizuPublishHelper";
import MiPublishHelper from "./MiPublishHelper";
import OppoPublishHelper from "./OppoPublishHelper";
import VivoPublishHelper from "./VivoPublishHelper";
import SogouPublishHelper from "./SogouPublishHelper";
import QQPublishHelper from "./QQPublishHelper";
import QihuPublishHelper from "./QihuPublishHelper";
let zk;
const androidPublishHelpers=[
    new HuaweiPublishHelper(zk),
    new MiPublishHelper(zk),
    new MeizuPublishHelper(zk),
    new OppoPublishHelper(zk),
    new VivoPublishHelper(zk),
    new SogouPublishHelper(zk),
    new QQPublishHelper(zk),
    new QihuPublishHelper(zk)
]
Promise.all(
    androidPublishHelpers.map(it=>it.publish("测试", "test", "cn.test", "2.6.7", "1. 更新xxx\n2.修复xxx", null))
)
