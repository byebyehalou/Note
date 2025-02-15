import { ipcMain, BrowserWindow, Menu, Tray, screen, app, BrowserView } from 'electron'
const mainProcess = require('./mainProcess')
const dayjs = require('dayjs')
import db from './server'
const path = require('path');
const fs = require("fs")
const logo = mainProcess.logo()

type note = {
    _id: string,
    title: string,
    isTopping: boolean | undefined | null,
    timingStatus: number | undefined,
    timinGtimeStamp: any,
    modeType: number | undefined
}


ipcMain.on('saveDataSetting', (event, winId, setting) => {
    db.get('NoteList').find({ _id: winId }).assign({ setting }).write()
})

ipcMain.handle('openLeft', (event, bool = true) => {
    const webContents = event.sender
    const win: any = BrowserWindow.fromWebContents(webContents)
    let bounds = win.getBounds()

    if (bool) {
        bounds.width = bounds.width + 350
        bounds.x = bounds.x - 350
        // bounds = { x: 806, y: 116, width: 701, height: 600 }
    } else {
        bounds.width = 350
        bounds.x = bounds.x + 350
        // bounds = { x: 1156, y: 116, width: 352, height: 600 }
    }
    // win.setBackgroundColor('#fff')
    // win.setBounds(bounds)
    console.log('bounds', bounds)
    win.flashFrame(false)
    win.setSize(bounds.width, 600)
    win.setPosition(bounds.x, bounds.y)
})

const getUser = function () {
    return db.get('User').valueOf()
}
//配置相关
ipcMain.on('setUser', (event, config) => {
    db.get('User').assign(config).write()
    const winList = BrowserWindow.getAllWindows()
    for (const item of winList) {
        item.webContents.send('sendUser', { config })
    }
    selfStarting(config.startUp)
})

ipcMain.handle('getUser', (event) => {
    return getUser()
})


ipcMain.on('zoomInAndOut', (event) => {
    const webContents = event.sender
    const win: any = BrowserWindow.fromWebContents(webContents)
    if (win.isMaximized()) {
        win.unmaximize()
    } else {
        win.maximize()
    }
})

app.whenReady().then(() => {
    let config = getUser()
    if (typeof config.startUp != 'undefined') {
        selfStarting(config.startUp)
    }

    setInterval(() => {
        const currentTimeStamp = dayjs().valueOf()

        const list: [note] = db.get('NoteList').filter((item: note) => {
            if (item.timinGtimeStamp < currentTimeStamp && item.timingStatus === 0) {

                return { _id: item._id }
            }
        }).value() || []
        const itemList: Object[] = []
        for (const item of list) {
            itemList.push({ _id: item._id, modeType: item.modeType || 0 })
            db.get('NoteList').find({ _id: item._id }).assign({ timingStatus: 1 }).write()
        }
        // console.log('轮询', list)
        if (itemList.length) {
            suspensionWin(itemList)
        }


    }, 2000);
})

const selfStarting = function (openAtLogin: boolean = true) {
    // const isAutoApp = app.getLoginItemSettings()
    const appFolder = path.dirname(process.execPath)
    const updateExe = path.resolve(appFolder, '\\', '便利贴.exe')
    console.log('appFolder', appFolder)
    console.log('updateExe', updateExe)
    console.log('app.getAppPath()', app.getAppPath())
    let exePath = appFolder + "\\便利贴.exe"
    //开机自启(登陆时打开)
    app.setLoginItemSettings({
        openAtLogin,
        args: ["--openAsHidden"],
        path: exePath
    })
    if (!global.isDevelopment) {
        fs.writeFile('日志.txt', JSON.stringify({ appFolder, updateExe, exePath, openAtLogin }), function (err: any) { });
    }

}

ipcMain.on('closeSuspensionWin', (event, id) => {
    const webContents = event.sender
    const win: any = BrowserWindow.fromWebContents(webContents)
    db.get('NoteList').find({ _id: id }).assign({ timing: '' }).write()
    win.close()
})

ipcMain.on('openEditeWindow', (event, id) => {


})

ipcMain.on('updateNote', (event, item) => {
    const _id = item._id
    item.timeStamp = dayjs().valueOf()
    item.time = dayjs().format('YYYY-MM-DD HH:mm')
    delete item.winId
    db.get('NoteList').find({ _id }).assign(item).write()
})

ipcMain.on('addWH', (event, { w, h }, open) => {
    const webContents = event.sender
    const win: any = BrowserWindow.fromWebContents(webContents)
    const bounds = win.getBounds()
    if (open) {
        bounds.x = bounds.x - w
        bounds.y = bounds.y - h
        bounds.width = bounds.width + w
        bounds.height = bounds.height + h
    } else {
        bounds.x = bounds.x + w
        bounds.y = bounds.y + h
        bounds.width = bounds.width - w
        bounds.height = bounds.height - h
    }
    console.log('bounds', bounds)
    win.setBounds(bounds)
})

ipcMain.on('windowMoving', (event, { mouseX, mouseY, width, height }) => {
    const webContents = event.sender
    const win: any = BrowserWindow.fromWebContents(webContents)
    const { x, y } = screen.getCursorScreenPoint()
    // win.setPosition(x - mouseX, y - mouseY)
    win.setBounds({ x: x - mouseX, y: y - mouseY, width, height })
});


const suspensionWin = function (itemList?: any) {
    const mainWindows = mainProcess.mainWindows()
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const { winURL } = mainWindows
    const win = new BrowserWindow({
        frame: false,
        transparent: true,
        width: 100,
        height: 100,
        x: width - 100,
        y: height - 100,
        resizable: false,
        alwaysOnTop: true,
        autoHideMenuBar: true,
        skipTaskbar: true,
        webPreferences: {
            // enableRemoteModule: true,
            nodeIntegration: true,
            contextIsolation: false,
        }
    })

    screen.on('display-metrics-changed', (event, display, changedMetrics) => {
        console.log('display', display)
        const { x, y, width, height } = display.workArea;
        win.setBounds({ x: width - 100, y: height - 100, width: 500, height: 500 })
    });
    const url = `${winURL}/#/menu?itemList=${JSON.stringify(itemList)}`
    win.loadURL(url)
    return win
}


const getNoteList = async function (page = 0, pageSize = 10) {


    const NoteList = db.get('NoteList')
    const noToppingList = await NoteList.filter((item: note) => !item.isTopping).orderBy('timeStamp', 'desc').value() || []
    const toppingList = await NoteList.filter((item: note) => item.isTopping).value() || []
    const list = toppingList.concat(noToppingList)
    let result = []

    if (Array.isArray(list) && list.length) {
        result = list.splice(page, pageSize)
    }

    return result
}

const getNote = function (_id: string) {
    return db.get('NoteList').find({ _id }).value()
}

ipcMain.handle('getNote', (_event, winId) => {
    let result = getNote(winId)
    return result
})

ipcMain.handle('getList', (event, page, pageSize) => {
    return getNoteList(page, pageSize)
})

ipcMain.handle('noteTopping', (_event, winId) => {
    const value = db.get('NoteList').find({ _id: winId }).value()
    value.isTopping = !value.isTopping ? true : false
    db.get('NoteList').remove({ _id: winId }).write()
    db.get('NoteList').unshift(value).write()
    return getNoteList()
})

ipcMain.handle('removeNote', (_event, winId) => {
    db.get('NoteList').remove({ _id: winId }).write()
    return getNoteList()
})

ipcMain.handle('search', (_event, key, modeType) => {
    if (key === '' && isNaN(modeType)) {
        return getNoteList()
    }
    const result = db.get('NoteList').filter((o: note) => {
        // 模糊查询
        let isKeyBool = o.title && key && o.title.match(key)
        if (isNaN(modeType)) {
            return isKeyBool
        }
        if (!isNaN(modeType)) {
            if (modeType === 0) {
                const idBool = o.modeType === 0 || typeof o.modeType === 'undefined'
                if (key) {
                    return isKeyBool && idBool
                }
                return idBool
            } else {
                const idBool = o.modeType === 1 || o.modeType === 2
                if (key) {
                    return isKeyBool && idBool
                }
                return idBool
            }

        }
    }).value()
    return result || []
})

ipcMain.on('closeEdited', (event, winId, tempOjb = {}, typeText) => {
    if (!winId) return
    const webContents = event.sender
    const win: any = BrowserWindow.fromWebContents(webContents)
    const bounds = win.getBounds()
    const getValue = db.get('NoteList').find({ _id: winId }).value()
    tempOjb._id = winId
    tempOjb.winAttribute = bounds
    tempOjb.timeStamp = dayjs().valueOf()
    tempOjb.time = dayjs().format('YYYY-MM-DD HH:mm')

    if (typeText != 'timing') {
        delete tempOjb.timing
        delete tempOjb.timinGtimeStamp
        delete tempOjb.timingStatus
    }

    delete tempOjb.winId;
    if (!getValue) {
        db.get('NoteList').unshift(tempOjb).write()
    } else if (getValue) {
        db.get('NoteList').find({ _id: winId }).assign(tempOjb).write()
    }
    console.log('typeText', typeText)
    global.mainWin.webContents.send('getEdited', tempOjb)
    if (!['timing', 'save'].includes(typeText)) {
        win.close()
    }

})

ipcMain.on('minimize', (event) => {
    const webContents = event.sender
    const win: any = BrowserWindow.fromWebContents(webContents)
    win.minimize()
})

ipcMain.handle('newWindow', async (event, { _id, pageType, winId, modeType }) => {
    const mainWindows = mainProcess.mainWindows()
    const { config, winURL } = mainWindows
    let newOjb: any = {
        width: 700,
        height: 500,
        minWidth: 200,
        minHeight: 100,
        frame: false
    }
    newOjb = Object.assign(config, newOjb)
    const note = db.get('NoteList').find({ _id }).value() || {}
    if (_id) {
        const winAttribute = note.winAttribute
        if (winAttribute && !note.isZoomInAndOut) {
            newOjb.width = winAttribute.width
            newOjb.height = winAttribute.height
            newOjb.x = winAttribute.x
            newOjb.y = winAttribute.y
        }

    }
    let newWin = function () {
        let result = new BrowserWindow(newOjb)
        const url = `${winURL}/#/${modeType ? 'outline' : 'edited'}?winId=${_id}&skipPageType=${pageType}`
        result.setIcon(logo)
        result.loadURL(url)
        return result
    }
    let win: any = {}
    if (winId) {
        win = BrowserWindow.fromId(winId)
        console.log('win', win)
        if (win) {
            if (win.isMinimized()) {
                win.restore()
            }
            if (!win.isFocused()) {
                win.focus()
            }
            win.show()
        } else {
            win = newWin()
        }

    } else {
        win = newWin()
    }

    if (note.isZoomInAndOut) {
        win.maximize()
    }

    return win.id
})



ipcMain.on('topping', (event, isTopping) => {
    const webContents = event.sender
    const win: any = BrowserWindow.fromWebContents(webContents)
    win.setAlwaysOnTop(isTopping)
})

ipcMain.on('closeWindow', async (event, id) => {
    const webContents = event.sender
    const win: any = BrowserWindow.fromWebContents(webContents)
    win.setSkipTaskbar(true)
    // suspensionWin()
    if (!id) {
        if (!global.isMenu) {
            const tray = new Tray(logo);
            const contextMenu = Menu.buildFromTemplate([{
                label: '显示',
                click: () => { win.show() }
            },
            {
                label: '退出',
                click: () => { win.destroy() }
            }
            ]);
            tray.setContextMenu(contextMenu);
            tray.on('click', () => {
                console.log('win.isVisible()', win.isVisible())
                win.isVisible() ? win.show() : win.hide()
            });

            global.isMenu = true
        }

        win.minimize()
        return
    }
    win.close()

})