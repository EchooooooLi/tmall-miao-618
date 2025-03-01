if (!auto.service) {
    toast('无障碍服务未启动！退出！')
    exit()
}

let showVersion
try {
    showVersion = require('version.js').showVersion
} catch(err) {
    showVersion = function () {
        console.log('无法加载version.js，获取版本失败。')
    }
}

console.show()
showVersion()

function getSetting() {
    let indices = []
    autoOpen && indices.push(0)
    autoMute && indices.push(1)
    autoJoin && indices.push(2)

    let settings = dialogs.multiChoice('任务设置', ['自动打开京东进入活动。多开或任务列表无法自动打开时取消勾选', '自动调整媒体音量为0。以免直播任务发出声音，首次选择需要修改系统设置权限', '自动完成入会任务。京东将授权手机号给商家，日后可能会收到推广短信'], indices)

    if (settings.length == 0) {
        toast('取消选择，任务停止')
        exit()
    }

    if (settings.indexOf(0) != -1) {
        storage.put('autoOpen', true)
        autoOpen = true
    } else {
        storage.put('autoOpen', false)
        autoOpen = false
    }
    if (settings.indexOf(1) != -1) {
        storage.put('autoMute', true)
        autoMute = true
    } else {
        storage.put('autoMute', false)
        autoMute = false
    }
    if (settings.indexOf(2) != -1) {
        storage.put('autoJoin', true)
        autoJoin = true
    } else {
        storage.put('autoJoin', false)
        autoJoin = false
    }
}

let storage = storages.create("jd_task");
let autoOpen = storage.get('autoOpen', true)
let autoMute = storage.get('autoMute', true)
let autoJoin = storage.get('autoJoin', true)
getSetting()

// 自定义取消亮屏的退出方法
function quit() {
    device.cancelKeepingAwake()
    exit()
}

// 监听音量下键
function registerKey() {
    events.observeKey()
    events.onKeyDown('volume_down', function (event) {
        console.log('京东任务脚本停止了')
        console.log('请手动切换回主页面')
        quit()
    })
}
threads.start(registerKey)

// 自定义一个findTextDescMatchesTimeout
function findTextDescMatchesTimeout(reg, timeout) {
    let c = 0
    while (c < timeout / 50) {
        let result = textMatches(reg).findOnce() || descMatches(reg).findOnce()
        if (result) return result
        sleep(50)
        c++
    }
    return null
}

// 打开京东进入活动
function openAndInto() {
    console.log('正在打开京东App...')
    if (!launch('com.jingdong.app.mall')) {
        console.log('可能未安装京东App')
    }

    sleep(2000)
    console.log('进入活动页面')

    app.startActivity({
        action: "VIEW",
        data: 'openApp.jdMobile://virtual?params={"category":"jump","action":"to","des":"m","sourceValue":"JSHOP_SOURCE_VALUE","sourceType":"JSHOP_SOURCE_TYPE","url":"https://u.jd.com/JCTuenU","M_sourceFrom":"mxz","msf_type":"auto"}'
    })
}

// 获取金币数量
function getCoin() {
    let anchor = className('android.view.View').filter(function (w) {
        if ((w.desc() && w.desc().match(/分红：.*份/)) || (w.text() && w.text().match(/分红：.*份/))) {
            return true
        } else {
            return false
        }
    }).findOne(5000)
    if (!anchor) {
        console.log('找不到分红控件')
        return false
    }
    let coin = anchor.parent().child(2).text()
    if (coin) {
        return parseInt(coin)
    } else {
        coin = anchor.parent().child(3).text() // 有可能中间插了个控件
        if (coin) {
            return parseInt(coin)
        } else {
            return false
        }
    }
}

// 打开抽奖页
function openPage() {
    let anchor = className('android.view.View').filter(function (w) {
        return w.clickable() && (w.text() == '去使用奖励' || w.desc() == '去使用奖励')
    }).findOne(5000)

    if (!anchor) {
        console.log('未找到使用奖励按钮，打开抽奖页失败')
        return false
    }

    let anchor_index = anchor.indexInParent()
    let sign = anchor.parent().child(anchor_index + 1) // 去使用的后1个
    sign.child(0).child(0).click() // child才可以点

    return text('剩余抽奖次数').findOne(8000)
}

// 查找任务，返回所有任务
function findTasks() {
    let anchor = text('剩余抽奖次数').findOnce()
    if (!anchor) {
        console.log('无法找到抽奖次数控件')
        return false
    }
    console.log('打开任务列表')
    anchor.parent().parent().parent().parent().child(1).click()
    sleep(5000)
    let go = text('去完成').findOnce()
    if (!go) {
        console.log('似乎未能打开任务列表')
        return false
    }
    console.log('任务列表已打开')
    let tasks = []
    let taskList = go.parent().children()
    let task = []
    for (let i = 0; i < taskList.length; i++) {
        let e = taskList[i]
        if (e.text()) {
            task.push(e.text())
            if (e.text() == '去完成') {
                if (!task[0].match(/邀/)) { // 如果有邀请好友就不完成
                    tasks.push([task[0], e])
                }
                task = []
            } else if (e.text() == '已完成') {
                task = []
            }
        }
    }
    console.log('任务寻找结束')
    return tasks
}

function backToPage() {
    back()
    if (!text('剩余抽奖次数').findOne(8000)) {
        console.log('返回失败，重试')
        back()
        if (!text('剩余抽奖次数').findOne(8000)) {
            console.log('似乎未能返回')
            return false
        }
    }
    return true
}

// 入会任务
function joinTask() {
    let check = textMatches(/.*确认授权即同意.*|.*我的特权.*|.*立即开卡.*|.*解锁全部会员福利.*/).findOne(8000)
    if (!check) {
        console.log('无法找到入会按钮，判定为已经入会')
        return true
    } else if (check.text().match(/我的特权/)) {
        console.log('已经入会，返回')
        return true
    } else {
        sleep(2000)
        if (check.text().match(/.*立即开卡.*|.*解锁全部会员福利.*/)) {
            let btn = check.bounds()
            console.log('即将点击开卡/解锁福利，自动隐藏控制台')
            sleep(500)
            console.hide()
            sleep(500)
            click(btn.centerX(), btn.centerY())
            sleep(500)
            console.show()
            check = textMatches(/.*确认授权即同意.*/).findOne(8000)
            sleep(2000)
        }

        if (!check) {
            console.log('无法找到入会按钮弹窗，加载失败')
            return false
        }

        if (check.indexInParent() == 6) {
            check = check.parent().child(5)
        } else if (check.text() == '确认授权即同意') {
            check = check.parent().child(0)
        } else {
            check = check.parent().parent().child(5)
        }

        check = check.bounds()

        let x = check.centerX()
        let y = check.centerY()

        console.log('检测是否有遮挡')
        let float = className('android.widget.ImageView')
            .filter(function (w) {
                let b = w.bounds()
                return b.left <= x && b.right >= x && b.top <= y && b.bottom >= y
            }).find()

        if (float.length > 1) {
            console.log('有浮窗遮挡，尝试移除')
            if (device.sdkInt >= 24) {
                gesture(1000, [x, y], [x, y + 200])
                console.log('已经进行移开操作，如果失败请反馈')
            } else {
                console.log('安卓版本低，无法自动移开浮窗，入会任务失败。至少需要安卓7.0。')
                return false
            }
        } else {
            console.log('未发现遮挡的浮窗，继续勾选')
        }

        console.log('即将勾选授权，自动隐藏控制台')
        sleep(500)
        console.hide()
        sleep(500)
        click(x, y)
        sleep(500)
        console.show()

        console.log('准备点击入会按钮')
        let j = textMatches(/^确认授权(并加入店铺会员)*$/).findOne(5000)
        if (!j) {
            console.log('无法找到入会按钮，失败')
            return false
        }
        click(j.bounds().centerX(), j.bounds().centerY())
        sleep(1000)
        console.log('入会完成，返回')
        return true
    }
}

// 进行抽奖活动
function doTask(task) {
    let tTitle = task[0]
    let tButton = task[1]
    console.log('进行', tTitle)
    tButton.click()
    if (tTitle.match(/签到/)) {
        console.log('签到完成')
        return true
    } else if (tTitle.match(/加购/)) {
        let itemFilter = textContains('!q70').filter(function (w) {
            // return w.bounds().width() == w.bounds().height() // 等宽高
            // return w.depth() >= 15
            let rect = w.bounds()
            return rect.left > 0 && rect.top <= device.height
        })

        if (!itemFilter.findOne(8000)) {
            console.log('未能找到加购商品')
            return false
        }
        console.log('查找商品')
        let items = itemFilter.find()
        if (items.empty() || items.length < 2) {
            console.log('查找商品失败')
            return false
        }
        for (let i = 0; i < 2; i++) {
            console.log('加购第' + (i+1) + '个商品')
            items[i].parent().parent().parent().child(1).child(2).click()
            sleep(2000)
        }
        console.log('加购完成')
        let t = items[0].parent().parent().parent().parent().parent()
        t.child(t.childCount() - 2).click() // 关闭
        return true
    } else if (tTitle.match(/会员|品牌页/)) {
        console.log('进行入会任务')
        return joinTask() && backToPage()
    } else {
        console.log('浏览任务，稍后返回')
        sleep(3000)
        return true && backToPage()
    }
}

// 抽奖
function openBox() {
    let anchor = text('剩余抽奖次数').findOne(8000)
    if (!anchor) {
        console.log('未能找到抽奖提示')
        return false
    }
    let count = anchor.parent().child(1)
    if (!parseInt(count)) {
        console.log('没有抽奖次数，返回')
        return true
    }
    console.log('进行抽奖，由于无法判断是否已经开盒，所以每个盒子都点一遍')
    let box = anchor.parent().parent().children()
    for (let i = 0; i < 6; i++) {
        console.log('打开第' + (i+1) + '个盒子')
        box[i].click()
        console.log('检测弹窗')
        let title = textContains('恭喜您').findOne(5000)
        if (title) {
            title = title.parent()
            title.child(title.childCount() - 2).click()
            sleep(1000)
        }
    }
    return true
}


let startCoin = null
let endCoin = null

// 全局try catch，应对无法显示报错
try {
    if (autoOpen) {
        openAndInto()
        console.log('等待活动页面加载')
        if (!findTextDescMatchesTimeout(/.*去使用奖励.*/, 8000)) {
            console.log('未能进入活动，请重新运行！')
            quit()
        }
    } else {
        alert('请关闭弹窗后立刻手动打开京东App进入活动页面', '限时30秒')
        console.log('请手动打开京东App进入活动')
        if (!findTextDescMatchesTimeout(/.*去使用奖励.*/, 30000)) {
            console.log('未能进入活动，请重新运行！')
            quit()
        }
    }

    console.log('成功进入活动，准备进行任务')
    sleep(5000)

    try {
        console.log('获取初始金币数量')
        startCoin = getCoin()
        console.log('当前共有' + startCoin + '金币')
    } catch (err) {
        console.log('获取金币失败，跳过', err)
    }

    // 完成所有任务的循环
    while (true) {
        try {
            console.log('获取当前金币数量')
            endCoin = getCoin()
            console.log('当前共有' + endCoin + '金币')
        } catch (err) {
            console.log('获取金币失败，跳过', err)
        }

        console.log('打开抽奖页面')
        if (openPage()) {
            let tasks = findTasks()
            if (!tasks) {
                console.log('无法找到任务，可能是已经完成。退出。')
                console.log('有时候可能抽奖失败，自己点进抽奖页再看一看。')
                startCoin && endCoin && console.log('本次任务共获得' + (endCoin - startCoin) + '金币')
                quit()
            }
            for (let i = 0; i < tasks.length; i++) {
                if (!autoJoin && tasks[i][0].match(/会员/)) {
                    continue
                }
                if (!doTask(tasks[i])) {
                    console.log('任务失败，退出')
                    quit()
                }
                sleep(5000)
            }
        } else {
            console.log('打开抽奖页失败，退出')
            quit()
        }
        console.log('准备抽奖')
        if (!openBox()) {
            console.log('抽奖失败，退出')
            quit()
        }
        console.log('准备重新打开获取任务')
        sleep(2000)
        back()
        console.log('返回上一级')
        if (!findTextDescMatchesTimeout(/.*去使用奖励.*/, 8000)) {
            console.log('未能返回到活动主页，重试')
            back()
            if (!findTextDescMatchesTimeout(/.*去使用奖励.*/, 8000)) {
                console.log('未能返回到活动主页，退出')
                quit()
            }
        }
        console.log('任务完成，准备抽奖')
        console.log('准备进行下一次任务')
        sleep(2000)
    }
} catch (err) {
    device.cancelKeepingAwake()
    if (err.toString() != 'JavaException: com.stardust.autojs.runtime.exception.ScriptInterruptedException: null') {
        startCoin && console.log('本次任务开始时有' + startCoin + '金币')
        console.error(new Error().stack, err)
    }
    showVersion()
}