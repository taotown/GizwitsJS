/**
 * @fileOverview  Gizwits JavaScript SDK
 * @version 0.1.0
 * @author Trevor(trevortao@gizwits.com)
 */

var LEN_DID = 22; //设备识别码长度
var CHAR_SIZE = 8; //指定MD5加密支持编码. 8 - ASCII; 16 - Unicode
var LEN_PRODUCT_KEY = 32; //产品标识码长度
var P0_TYPE_ATTRS_V4 = "attrs_v4"; //数据点协议P0
var PROTOCOL_VER = [0x00, 0x00, 0x00, 0x03]; //P0协议版本号
var RETRY_WAIT_TIME = 5000; //用户重登/Websocket重连间隔(毫秒)
var RETRY_SEND_TIME = 2000; //重连Websocket后重新下发指令的时间间隔(毫秒)
var GET_BOUND_DEV_ONE_STEP_LIMIT = 20; //获取绑定设备列表单次请求设备数量
var DEV_TYPE_NORMAL = "normal"; //普通设备类型
var DEV_TYPE_CENTER_CONTROL = "center_control"; //中控设备类型
var DEV_TYPE_SUB = "sub_dev"; //子设备类型
var DEV_ROLE_SPECIAL = "special"; //潜在Owner用户设备
var DEV_ROLE_OWNER = "owner"; //Owner用户设备
var DEV_ROLE_GUEST = "guest"; //Guest用户设备
var DEV_ROLE_NORMAL = "normal"; //普通用户设备

var CMD_TRANS_BUSINESS_RESP = 0x94;
var P0_CMD_REPORT_SUBDEVICE_STATUS = 0x10; //子设备上下线状态变更通知(中控)
var P0_CMD_ADD_SUBDEVICE_RESP = 0x57; //添加子设备应答(中控)
var P0_CMD_DELETE_SUBDEVICE_RESP = 0x59; //删除子设备(中控)
var P0_CMD_GET_SUBDEVICE_LIST_RESP = 0x5B; //获取子设备列表应答(中控)
var P0_CMD_REPORT_SUBDEVICE_LIST = 0x5C; //子设备列表变更通知(中控)

//错误码枚举
var ERROR_CODE = {
    GIZ_SDK_PARAM_INVALID: 8006,
    GIZ_SDK_DEVICE_DID_INVALID: 8024,
    GIZ_SDK_DEVICE_NOT_CENTERCONTROL: 8028,
    GIZ_SDK_DEVICE_NOT_BIND: 8032,
    GIZ_SDK_BIND_DEVICE_FAILED: 8039,
    GIZ_SDK_UNBIND_DEVICE_FAILED: 8040,
    GIZ_SDK_HTTP_REQUEST_FAILED: 8099,
    GIZ_SDK_SUBDEVICE_ADD_FAILED: 8140,

    GIZ_SDK_WEB_SOCKET_CLOSED: 8900,
    GIZ_SDK_SUBSCRIBE_FAILED: 8901,
    GIZ_SDK_WEB_SOCKET_INVALID: 8902,
    GIZ_SDK_WEB_SOCKET_ERROR: 8903,
    GIZ_SDK_SET_DEVICE_INFO_ERROR: 8904
}

/**
 * Gizwits JavaScript SDK对象构造函数
 * 
 * @class
 * @param {Object} params 指定参数对象({ apiHost: "xxx", gizwitsOpenId: "yyy", gizwitsAppId: "zzz" })
 */
function GizwitsJS(params) {
    if (!params) {
        console.log("Call GizwitsJS with invaild params " + params);
        return;
    }

    if (!params.apiHost) {
        console.log("Call GizwitsJS with invaild params.apiHost " + params.apiHost);
        return;
    }

    if (!params.gizwitsOpenId) {
        console.log("Call GizwitsJS with invaild params.gizwitsOpenId " + params.gizwitsOpenId);
        return;
    }

    if (!params.gizwitsAppId) {
        console.log("Call GizwitsJS with invaild params.gizwitsAppId " + params.gizwitsAppId);
        return;
    }

    //外部回调
    this.onBindDevice = undefined;
    this.onEventNotify = undefined;
    this.onReceiveData = undefined;
    this.onUnBindDevice = undefined;
    this.onSetDeviceInfo = undefined;
    this.onGetDeviceList = undefined;
    this.onDiscoverDevices = undefined;
    this.onSubscribeDevice = undefined;
    this.onUpdateSubDevices = undefined;
    this.onDeviceOnlineStatusChanged = undefined;

    this.onGetGroupList = undefined;
    this.onUpdateGroupList = undefined;
    this.onEditGroupName = undefined;
    this.onUpdateGroupDeviceList = undefined;
    this.onGroupWrite = undefined;

    this.onGetSceneList = undefined;
    this.onEditSceneInfo = undefined;
    this.onUpdateSceneList = undefined;
    this.onUpdateSceneStatus = undefined;
    this.onExecuteScene = undefined;

    this.onGetBindingUsers = undefined;
    this.onUnbindUser = undefined;
    this.onGetDeviceSharingInfos = undefined;
    this.onSharingDevice = undefined;
    this.onRevokeDeviceSharing = undefined;
    this.onAcceptDeviceSharing = undefined;
    this.onCheckDeviceSharingInfoByQRCode = undefined;
    this.onAcceptDeviceSharingByQRCode = undefined;
    this.onModifySharingInfo = undefined;

    this.onQueryMessageList = undefined;
    this.onMarkMessageStatus = undefined;

    //内部变量
    this._gloabSN = 1;
    this._keepalive = 180;
    this._subDevices = {};
    this._connections = {};
    this._boundDevices = {};
    this._userID = undefined;
    this._userToken = undefined;
    this._heartbeatInterval = 55;
    this._apiHost = params.apiHost;
    this._appID = params.gizwitsAppId;
    this._openID = params.gizwitsOpenId;
    this._groupList = {};
    this._sceneList = {};
}

/**
 * Websocket连接对象构造函数
 * 
 * @class
 * @param {String}   wsInfo   指定Websocket域名信息
 * @param {Function} callback 指定回调对象
 */
function Connection(wsInfo, callback) {
    this._subscribedDids = {};
    this._loginFailedCount = 0;
    this._websocket = undefined;
    this._callbackObj = callback;
    this._heartbeatTimerID = undefined;
    this._lastConnectMilliTimestamp = 0;
    this._wsUrl = "{0}/ws/app/v1".format(wsInfo);
}

/**
 * 获取设备列表(回调合并后的设备列表(包括未绑定的子设备))
 * 
 * @see 回调接口 onDiscoverDevices(ret, err) 成功ret非空失败err非空
 */
GizwitsJS.prototype.discoverDevices = function() {
    this._getUserToken();
}

/**
 * 读取缓存设备列表(回调合并后的设备列表(包括未绑定的子设备))
 * 
 * @see 回调接口 onGetDeviceList(ret)
 */
GizwitsJS.prototype.getDeviceList = function() {
    this._onDiscoverDevices(this.onGetDeviceList);
}

/**
 * 订阅指定设备标识码对应的设备
 * 
 * @param {Object} params 指定参数对象({did: "xxx"})
 * @see 回调接口 onSubscribeDevice(ret, err) 成功ret非空失败err非空
 */
GizwitsJS.prototype.subscribeDevice = function(params) {
    if (!params) {
        this._sendError(this.onSubscribeDevice,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params " + params);
        return;
    }

    if (!params.did) {
        this._sendError(this.onSubscribeDevice,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params.did " + params.did);
        return;
    }

    if (!this._boundDevices) {
        this._sendError(this.onSubscribeDevice,
            GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    //找到指定设备标识码对应的设备对象
    var device = this._boundDevices[params.did];
    if (!device) {
        this._sendError(this.onSubscribeDevice,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    //创建Websocket用于传输数据点数据跟自定义数据
    this._connect(device);
};

/**
 * 读取指定设备标识码对应的设备的状态(对于定义了变长数据点的设备还可以指定关心的数据点名称读取指定的数据点状态)
 * 
 * @param {Object} params 指定参数对象({ did: "xxx", attrs: ["yyy"] })
 * @see 回调接口 onReceiveData(ret, err) 成功ret非空失败err非空
 */
GizwitsJS.prototype.read = function(params) {
    if (!params) {
        this._sendError(this.onReceiveData,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params " + params);
        return;
    }

    if (!params.did) {
        this._sendError(this.onReceiveData,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params.did " + params.did);
        return;
    }

    if (!this._boundDevices) {
        this._sendError(this.onReceiveData,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    //找到指定设备标识码对应的设备对象
    var device = this._boundDevices[params.did];
    if (!device) {
        this._sendError(this.onReceiveData,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    //由于中控设备不支持0x90 02查询状态,故在WebsocketAPI兼容0x93SN02之前采用GET /app/devdata/{did}/latest间接实现
    if (DEV_TYPE_CENTER_CONTROL === device.type && device.is_online) {
        this._getDeviceLatestData(device.did);
    } else {
        //往Websocket连接发送数据点数据读请求
        if (params.attrs) {
            this._sendJson(device, {
                cmd: "c2s_read",
                data: {
                    did: params.did,
                    names: params.attrs
                }
            });
        } else {
            this._sendJson(device, {
                cmd: "c2s_read",
                data: {
                    did: params.did
                }
            });
        }
    }
};

/**
 * 向指定设备标识码对应的设备发送指定数据点数据或自定义数据
 * 
 * @param {Object} params 指定参数对象({ did: "xxx", attrs: ["yyy"], raw: [Number] })
 * @see 回调接口 onReceiveData(ret, err) 成功ret非空失败err非空
 */
GizwitsJS.prototype.write = function(params) {
    if (!params) {
        this._sendError(this.onReceiveData,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params " + params);
        return;
    }

    if (!params.did) {
        this._sendError(this.onReceiveData,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params.did " + params.did);
        return;
    }

    if (!this._boundDevices) {
        this._sendError(this.onReceiveData,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    //找到指定设备标识码对应的设备对象
    var device = this._boundDevices[params.did];
    if (!device) {
        this._sendError(this.onReceiveData,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    if (params.attrs) {
        //往Websocket连接发送数据点数据
        this._sendJson(device, {
            cmd: "c2s_write",
            data: {
                did: params.did,
                attrs: params.attrs
            }
        });
    }

    if (params.raw) {
        //往Websocket连接发送自定义数据
        this._sendJson(device, {
            cmd: "c2s_raw",
            data: {
                did: params.did,
                raw: params.raw
            }
        });
    }
};

/**
 * 更新指定设备标识码对应的中控的子设备列表
 * 
 * @param {Object} params 指定参数对象({ did: "xxx" })
 * @see 回调接口 onUpdateSubDevices(ret, err) 成功ret非空失败err非空
 */
GizwitsJS.prototype.updateSubDevices = function(params) {
    if (!params) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params " + params);
        return;
    }

    if (!params.did) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params.did " + params.did);
        return;
    }

    if (!typeof this._boundDevices) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    //找到指定设备标识码对应的设备对象
    var device = this._boundDevices[params.did];
    if (!device) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    if (device.type != DEV_TYPE_CENTER_CONTROL) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_CENTERCONTROL,
            arguments.callee.name + ": is not center control device",
            params.did);
        return;
    }

    //由于长度字段依赖后续字段长度,故先组装长度字段后续字段
    var index = 0;
    var remainData = new Uint8Array(8);
    var remainDataView = new DataView(remainData.buffer);
    remainData[index++] = 0x00; //Flag
    remainData.set([0x00, 0x93], index); //指定透传业务指令0x0093
    index += 2;
    remainDataView.setInt32(index, this._gloabSN++); //指定SN
    index += 4;
    remainData[index++] = 0x5A; //指定获取子设备列表Action

    //组整包
    var data = PROTOCOL_VER.concat(this._getMQTTLenArray(index)).concat(Array.from(remainData.slice(0, index)));

    //往Websocket连接发送自定义数据
    this._sendJson(device, {
        cmd: "c2s_raw",
        data: {
            did: params.did,
            raw: data
        }
    });
}

/**
 * 向指定设备标识码对应的中控发送添加子设备请求(并可指定待筛选的子设备信息)
 * 
 * @param {Object} params 指定参数对象({ did: "xxx", subDevices: [{ mac: "yyy", productKey: "zzz" }]})
 * @see 回调接口 onUpdateSubDevices(ret, err) 成功ret非空失败err非空
 */
GizwitsJS.prototype.addSubDevice = function(params) {
    if (!params) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params " + params);
        return;
    }

    if (!params.did) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params.did " + params.did);
        return;
    }

    if (!this._boundDevices) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    //找到指定设备标识码对应的设备对象
    var device = this._boundDevices[params.did];
    if (!device) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    if (device.type != DEV_TYPE_CENTER_CONTROL) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_CENTERCONTROL,
            arguments.callee.name + ": is not center control device",
            params.did);
        return;
    }

    //由于长度字段依赖后续字段长度,故先组装长度字段后续字段
    var index = 0;
    var remainData = new Uint8Array(128);
    var remainDataView = new DataView(remainData.buffer);
    remainData[index++] = 0; //Flag
    remainData.set([0x00, 0x93], index); //指定透传业务指令0x0093
    index += 2;
    remainDataView.setInt32(index, this._gloabSN++); //指定SN
    index += 4;
    remainData[index++] = 0x56; //指定添加子设备Action
    var subDeviceNum = params.subDevices ? params.subDevices.length : 0;
    if (subDeviceNum) {
        remainDataView.setInt16(index, subDeviceNum); //指定设备识别码个数
        index += 2;
    }

    //指定设备识别码
    var encoder = new TextEncoder();
    for (var i = 0; i < subDeviceNum; i++) {
        var mac = params.subDevices[i].mac;
        if (mac) {
            remainData[index++] = mac.length; //设备识别码长度
            remainData.set(encoder.encode(mac), index); //设备识别码
            index += mac.length;
        }
    }

    //组整包
    var data = PROTOCOL_VER.concat(this._getMQTTLenArray(index)).concat(Array.from(remainData.slice(0, index)));

    //往Websocket连接发送自定义数据
    this._sendJson(device, {
        cmd: "c2s_raw",
        data: {
            did: params.did,
            raw: data
        }
    });
}

/**
 * 向指定设备标识码对应的中控发送删除指定子设备信息对应的子设备请求
 * 
 * @param {Object} params 指定参数对象({ did: "xxx", subDevices: [{ did: "yyy" }]})
 * @see 回调接口 onUpdateSubDevices(ret, err) 成功ret非空失败err非空
 */
GizwitsJS.prototype.removeSubDevice = function(params) {
    if (!params) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params " + params);
        return;
    }

    if (!params.did) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params.did " + params.did);
        return;
    }

    if (!params.subDevices) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params.subDevices " + params.subDevices,
            params.did);
        return;
    }

    if (!this._boundDevices) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    //找到指定设备标识码对应的设备对象
    var device = this._boundDevices[params.did];
    if (!device) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    if (device.type != DEV_TYPE_CENTER_CONTROL) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_CENTERCONTROL,
            arguments.callee.name + ": is not center control device",
            params.did);
        return;
    }

    //找到指定设备标识码对应的设备对象下的子设备列表
    var subDevicesCache = this._subDevices[params.did];
    if (!subDevicesCache) {
        this._sendError(this.onUpdateSubDevices,
            ERROR_CODE.GIZ_SDK_DEVICE_DID_INVALID,
            arguments.callee.name + ": invaild did",
            params.did);
        return;
    }

    //挨个删除子设备
    for (var i = 0; i < params.subDevices.length; i++) {
        var subDeviceCache = subDevicesCache[params.subDevices[i].did];
        if (subDeviceCache) {
            //匹配到子设备
            //由于长度字段依赖后续字段长度,故先组装长度字段后续字段
            var index = 0;
            var remainData = new Uint8Array(16);
            var remainDataView = new DataView(remainData.buffer);
            remainData[index++] = 0; //Flag
            remainData.set([0x00, 0x93], index); //指定透传业务指令0x0093
            index += 2;
            remainDataView.setInt32(index, this._gloabSN++); //指定SN
            index += 4;
            remainData[index++] = 0x58; //指定删除子设备Action
            remainDataView.setInt32(index, subDeviceCache.subDid); //指定待删除子设备ID
            index += 4;

            //组整包
            var data = PROTOCOL_VER.concat(this._getMQTTLenArray(index)).concat(Array.from(remainData.slice(0, index)));

            //往Websocket连接发送自定义数据
            this._sendJson(device, {
                cmd: "c2s_raw",
                data: {
                    did: params.did,
                    raw: data
                }
            });
        }
    }
}

/**
 * 通过MAC与ProductKey绑定设备(如果是微信开发者,能够通过微信完成设备绑定的,不需要调用此接口)
 *
 * @param {Object} params 指定参数对象({ device: { mac: "xxx", productKey: "yyy"}, bindInfo: { product_secret: "zzz", device_bind_url: "www" }})
 * @see 成功回调接口 onBindDevice(ret, err) 成功ret非空失败err非空
 */
GizwitsJS.prototype.bindDevice = function(params) {
    if (!params) {
        this._sendError(this.onBindDevice,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params " + params);
        return;
    }

    if (!params.device) {
        this._sendError(this.onBindDevice,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params.device " + params.device);
        return;
    }

    if (!params.bindInfo) {
        this._sendError(this.onBindDevice,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params.bindInfo " + params.bindInfo);
        return;
    }

    if (params.bindInfo.product_secret) {
        this._bindDeviceByMAC(params.device.mac, params.device.productKey, params.bindInfo.product_secret);
    } else if (params.bindInfo.device_bind_url) {
        this._bindDeviceCustom(params.device.mac, params.device.productKey, params.bindInfo.device_bind_url);
    } else {
        this._sendError(this.onBindDevice,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            "Please special valid product_secret or device_bind_url in bindInfo when calling bindDevice.");
    }
}

/**
 * 指定指定设备标识码对应的已绑定设备
 *
 * @param {Object} params 指定参数对象({ did: "xxx" })
 * @see 成功回调接口 onUnBindDevice(ret, err) 成功ret非空失败err非空
 */
GizwitsJS.prototype.unBindDevice = function(params) {
    if (!params) {
        this._sendError(this.onUnBindDevice,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params " + params);
        return;
    }

    if (!params.did) {
        this._sendError(this.onUnBindDevice,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params.did " + params.did);
        return;
    }

    if (!this._boundDevices) {
        this._sendError(this.onUnBindDevice,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    //找到指定设备标识码对应的设备对象
    var device = this._boundDevices[params.did];
    if (!device) {
        this._sendError(this.onUnBindDevice,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    this._unBindDevice(device.did);
}

/**
 * 修改设备信息
 *
 * @param {Object} params 指定参数对象({ did: "xxx", alias: "yyy", remark: "zzz"})
 * @see 成功回调接口 onSetDeviceInfo(ret, err) 成功ret非空失败err非空
 */
GizwitsJS.prototype.setDeviceInfo = function(params) {
    if (!params) {
        this._sendError(this.onSetDeviceInfo,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params " + params);
        return;
    }

    if (!params.did) {
        this._sendError(this.onSetDeviceInfo,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params.did " + params.did);
        return;
    }

    if (null == params.remark && null == params.alias) {
        this._sendError(this.onSetDeviceInfo,
            ERROR_CODE.GIZ_SDK_PARAM_INVALID,
            arguments.callee.name + ": invaild params.remark " + params.remark + " and params.alias " + params.alias);
        return;
    }

    //找到指定设备标识码对应的设备对象
    var device = this._boundDevices[params.did];
    if (!device) {
        this._sendError(this.onSetDeviceInfo,
            ERROR_CODE.GIZ_SDK_DEVICE_NOT_BIND,
            arguments.callee.name + ": " + params.did + " not exist in bound devices");
        return;
    }

    this._setDeviceInfo(params.did, params.alias, params.remark);
}


GizwitsJS.prototype.getGroupList = function() {
    this.onGetGroupList({ "groups": this._groupList }); //没有did参数
};

GizwitsJS.prototype.addGroup = function(params) {
    this._addGroup(params.name, params.product_key);
};

GizwitsJS.prototype.deleteGroup = function(params) {
    this._deleteGroup(params.group_id);
};

GizwitsJS.prototype.updateGroupList = function() {
    this._updateGroupList();
};

GizwitsJS.prototype.editGroupInfo = function(params) {
    this._editGroupInfo(params.group_id, params.group_name);
};

GizwitsJS.prototype.addGroupDevices = function(params) {
    this._addGroupDevices(params.group_id, params.devices);
};

GizwitsJS.prototype.deleteGroupDevices = function(params) {
    this._deleteGroupDevices(params.group_id, params.devices);
};

GizwitsJS.prototype.updateGroupDevices = function(params) {
    this._updateGroupDevices(params.group_id);
};

GizwitsJS.prototype.groupWrite = function(params) {
    this._groupWrite(params.group_id, params.attrs, params.raw);
};

GizwitsJS.prototype.getScenenList = function() {
    this.onGetSceneList({ "scenes": this._sceneList });
};

GizwitsJS.prototype.addScene = function(params) {
    this._addScene(params.name, params.remark, params.tasks)
};

GizwitsJS.prototype.editSceneInfo = function(params) {
    this._editSceneInfo(params.scene_id, params.scene_name, params.remark, params.tasks);
};

GizwitsJS.prototype.deleteScene = function(params) {
    this._deleteScene(params.scene_id);
};

GizwitsJS.prototype.updateScenes = function() {
    this._updateScenes();
};

GizwitsJS.prototype.updateSceneStatus = function(params) {
    this._updateSceneStatus(params.scene_id);
};

GizwitsJS.prototype.executeScene = function(params) {
    this._executeScene(params.scene_id);
};

GizwitsJS.prototype.getBindingUsers = function(params) {
    this._getBindingUsers(params.did);
};

GizwitsJS.prototype.unbindUser = function(params) {
    this._unbindUser(params.did, params.uid);
};

GizwitsJS.prototype.getDeviceSharingInfos = function(params) {
    this._getDeviceSharingInfos(params.did, params.type);
};

GizwitsJS.prototype.sharingDevice = function(params) {
    this._sharingDevice(params.did, params.type, params.uid, params.username, params.email, params.phone);
};

GizwitsJS.prototype.revokeDeviceSharing = function(params) {
    this._revokeDeviceSharing(params.id);
};

GizwitsJS.prototype.acceptDeviceSharing = function(params) {
    this._acceptDeviceSharing(params.id, params.accept);
};

GizwitsJS.prototype.checkDeviceSharingInfoByQRCode = function(params) {
    this._checkDeviceSharingInfoByQRCode(params.code);
};

GizwitsJS.prototype.acceptDeviceSharingByQRCode = function(params) {
    this._acceptDeviceSharingByQRCode(params.code);
};

GizwitsJS.prototype.modifySharingInfo = function(params) {
    this._modifySharingInfo(params.id, params.user_alias);
};

GizwitsJS.prototype.queryMessageList = function(params) {
    this._queryMessageList(params.type);
};

GizwitsJS.prototype.markMessageStatus = function(params) {
    this._markMessageStatus(params.id, params.status);
};

//=========================================================
// http functions
//=========================================================
GizwitsJS.prototype._getDeviceLatestData = function(did) {
    var gizJS = this;
    var url = "https://{0}/app/devdata/{1}/latest".format(gizJS._apiHost, did);

    $.ajax(url, {
            type: "GET",
            contentType: "application/json",
            headers: {
                "X-Gizwits-Application-Id": gizJS._appID,
                "X-Gizwits-User-token": gizJS._userToken
            },
            dataType: "json"
        })
        .done(function(result) {
            if (result.did && result.attr) {
                gizJS.onReceiveData({
                    did: did,
                    attrs: result.attr
                });
            }
        });
}

GizwitsJS.prototype._unBindDevice = function(did) {
    var gizJS = this;
    var url = "https://{0}/app/bindings".format(gizJS._apiHost);
    var data = JSON.stringify({ devices: [{ did: did }] });

    $.ajax(url, {
            type: "DELETE",
            contentType: "application/json",
            headers: {
                "X-Gizwits-Application-Id": gizJS._appID,
                "X-Gizwits-User-token": gizJS._userToken
            },
            dataType: "json",
            data: data
        })
        .done(function(result) {
            if (result.success && result.success[0]) {
                gizJS.onUnBindDevice({ did: did });
                if (DEV_TYPE_CENTER_CONTROL === gizJS._boundDevices[did].type) {
                    if (gizJS._subDevices[did]) {
                        delete gizJS._subDevices[did]; //删除中控子设备缓存
                    }
                }
                //删除订阅
                var device = gizJS._boundDevices[did];
                var conn = gizJS._connections[gizJS._getWebsocketConnInfo(device)];
                if (conn && conn._subscribedDids[did]) {
                    //断开连接
                    conn._websocket.close();
                    conn._removeSubscribeDid(did);
                }
                delete gizJS._boundDevices[did]; //删除设备缓存
                gizJS._onDiscoverDevices(gizJS.onDiscoverDevices);
            } else {
                gizJS._sendError(gizJS.onUnBindDevice,
                    gizJS._getErrorCode(result, ERROR_CODE.GIZ_SDK_UNBIND_DEVICE_FAILED),
                    "unbindDevice failed: " + JSON.stringify(result));
            }
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onUnBindDevice,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_UNBIND_DEVICE_FAILED),
                "unbind device error, status:" + evt.status + ", responseText:" + evt.responseText,
                did);
        });
}

GizwitsJS.prototype._setDeviceInfo = function(did, alias, remark) {
    var gizJS = this;
    var isChanged = false;
    var url = "https://{0}/app/bindings/{1}".format(gizJS._apiHost, did);
    var dataObj = {};

    if (remark) {
        dataObj.remark = remark;
    }
    if (alias) {
        dataObj.dev_alias = alias;
    }
    var data = JSON.stringify(dataObj);
    $.ajax(url, {
            type: "PUT",
            contentType: "application/json",
            headers: {
                "X-Gizwits-Application-Id": gizJS._appID,
                "X-Gizwits-User-token": gizJS._userToken
            },
            dataType: "json",
            data: data
        })
        .done(function(result) {
            if (result.remark) {
                if (gizJS._boundDevices[did].remark != result.remark) {
                    gizJS._boundDevices[did].remark = result.remark;
                    isChanged = true;
                }
            }
            if (result.dev_alias) {
                if (gizJS._boundDevices[did].dev_alias != result.dev_alias) {
                    gizJS._boundDevices[did].dev_alias = result.dev_alias;
                    isChanged = true;
                }
            }
            if (gizJS.onSetDeviceInfo) {
                gizJS.onSetDeviceInfo({ did: did });
            }
            if (isChanged) {
                gizJS._onDiscoverDevices(gizJS.onDiscoverDevices);
            }
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onSetDeviceInfo,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_SET_DEVICE_INFO_ERROR),
                "set device info error, status:" + evt.status + ", responseText:" + evt.responseText,
                did);
        });
}

GizwitsJS.prototype._bindDeviceByMAC = function(mac, productKey, productSecret) {
    var gizJS = this;
    var timestamp = Date.now() / 1000 >> 0; //去当前时间戳
    var signature = hexMD5(productSecret + timestamp); //将产品密钥跟时间戳拼接后计算MD5得到签名字符串
    var url = "https://{0}/app/bind_mac".format(gizJS._apiHost);
    var data = JSON.stringify({
        mac: mac,
        product_key: productKey
    });

    $.ajax(url, {
            type: "POST",
            contentType: "application/json",
            headers: {
                "X-Gizwits-Application-Id": gizJS._appID,
                "X-Gizwits-User-token": gizJS._userToken,
                "X-Gizwits-Timestamp": timestamp,
                "X-Gizwits-Signature": signature
            },
            dataType: "json",
            data: data
        })
        .done(function(result) {
            if (result.did) {
                gizJS._boundDevices[result.did] = result;

                if (gizJS.onBindDevice) {
                    gizJS.onBindDevice({ did: result.did });
                }
                gizJS._onDiscoverDevices(gizJS.onDiscoverDevices);
            } else {
                gizJS._sendError(gizJS.onBindDevice,
                    gizJS._getErrorCode(result, ERROR_CODE.GIZ_SDK_BIND_DEVICE_FAILED),
                    "bindDevice response invaild result: " + JSON.stringify(result));
            }
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onBindDevice,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_BIND_DEVICE_FAILED),
                "bindDevice error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
}

GizwitsJS.prototype._bindDeviceCustom = function(mac, productKey, customURL) {
    var gizJS = this;
    var data = JSON.stringify({
        mac: mac,
        token: gizJS._userToken,
        product_key: productKey
    });

    $.ajax(customURL, {
            type: "POST",
            contentType: "application/json",
            dataType: "json",
            data: data
        })
        .done(function(result) {
            if (result.host) {
                gizJS._boundDevices[result.did] = result;

                if (gizJS.onBindDevice) {
                    gizJS.onBindDevice({ did: result.did });
                }
                gizJS._onDiscoverDevices(gizJS.onDiscoverDevices);
            } else {
                var online = false;
                if ('online' === result.netStatus) {
                    online = true;
                }
                if (result.did) {
                    gizJS._boundDevices[result.did] = {
                        remark: "",
                        dev_alias: "",
                        type: "sub_dev",
                        did: result.did,
                        mac: result.mac,
                        is_online: online,
                        product_key: result.product_key
                    };

                    if (gizJS.onBindDevice) {
                        gizJS.onBindDevice({ did: result.did });
                    }
                    //获取一次绑定设备列表同步绑定信息
                    gizJS._getBoundDevices(GET_BOUND_DEV_ONE_STEP_LIMIT, 0);
                } else {
                    gizJS._sendError(gizJS.onBindDevice,
                        gizJS._getErrorCode(result, ERROR_CODE.GIZ_SDK_BIND_DEVICE_FAILED),
                        "bindDevice response invaild result: " + JSON.stringify(result));
                }
            }
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onBindDevice,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_BIND_DEVICE_FAILED),
                "bindDevice error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
}

GizwitsJS.prototype._getUserToken = function() {
    var gizJS = this;
    var url = "https://{0}/app/users".format(gizJS._apiHost);
    var data = JSON.stringify({
        phone_id: gizJS._openID,
        lang: "en"
    });

    $.ajax(url, {
            type: "POST",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID },
            dataType: "json",
            data: data
        })
        .done(function(result) {
            gizJS._userID = result.uid;
            gizJS._userToken = result.token;
            gizJS._updateGroupList();
            gizJS._updateScenes();
            gizJS._getBoundDevices(GET_BOUND_DEV_ONE_STEP_LIMIT, 0);
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onDiscoverDevices,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "get user token failed, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._getBoundDevices = function(limit, skip) {
    var gizJS = this;
    var url = "https://{0}/app/bindings".format(gizJS._apiHost);
    var query = "?show_disabled=0&limit=" + limit + "&skip=" + skip;

    $.ajax(url + query, {
            type: "GET",
            contentType: "application/json",
            dataType: "json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken }
        })
        .done(function(result) {
            if (skip === 0) { //后续叠加请求时，不清理之前的结果
                gizJS._boundDevices = {};
            }
            for (var i = result.devices.length - 1; i >= 0; i--) {
                var device = result.devices[i];
                gizJS._boundDevices[device.did] = device;
            }

            if (result.devices.length === limit) {
                gizJS._getBoundDevices(limit, skip + limit);
            } else {
                gizJS._onDiscoverDevices(gizJS.onDiscoverDevices);
            }
        })
        .fail(function(evt) {
            gizJS._boundDevices = {};
            gizJS._sendError(gizJS.onDiscoverDevices,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "getBoundDevices error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._updateGroupList = function() {
    var gizJS = this;
    var url = "https://{0}/app/group".format(gizJS._apiHost);

    $.ajax(url, {
            type: "GET",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            gizJS._groupList = new Array();
            if (result) {
                for (var i = 0; i < result.length; i++) {
                    var groupInfo = result[i];
                    gizJS._groupList[i] = {
                        "group_id": groupInfo.id,
                        "group_name": groupInfo.group_name,
                        "group_product_key": groupInfo.product_key,
                        "verbose_name": groupInfo.verbose_name
                    };
                }
            }
            gizJS.onUpdateGroupList({ groups: gizJS._groupList }, null);
        })
        .fail(function(evt) {
            gizJS._groupList = {};
            gizJS._sendError(gizJS.onUpdateGroupList,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "onUpdateGroupList error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._addGroup = function(name, pk) {
    var gizJS = this;
    var url = "https://{0}/app/group".format(gizJS._apiHost);
    var data = JSON.stringify({
        product_key: pk,
        group_name: name
    });

    $.ajax(url, {
            type: "POST",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json",
            data: data
        })
        .done(function(result) {
            gizJS._updateGroupList();
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onUpdateGroupList,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "onUpdateGroupList error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._deleteGroup = function(gid) {
    var gizJS = this;
    var url = "https://{0}/app/group/{1}".format(gizJS._apiHost, gid);

    $.ajax(url, {
            type: "DELETE",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            gizJS._updateGroupList();
        })
        .fail(function(evt) {
            if (evt.status == 200) {
                gizJS._updateGroupList();
            } else {
                gizJS._sendError(gizJS.onUpdateGroupList,
                    gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                    "onUpdateGroupList error, status:" + evt.status + ", responseText:" + evt.responseText);
            }
        });
};

GizwitsJS.prototype._editGroupInfo = function(gid, name) {
    var gizJS = this;
    var url = "https://{0}/app/group/{1}".format(gizJS._apiHost, gid);
    var data = JSON.stringify({
        group_name: name
    });

    $.ajax(url, {
            type: "PUT",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json",
            data: data
        })
        .done(function(result) {
            gizJS.onEditGroupName({ group_id: gid }, null);
        })
        .fail(function(evt) {
            if (evt.status == 200) {
                gizJS.onEditGroupName({ group_id: gid }, null);
            } else {
                gizJS.onEditGroupName(null, {
                    group_id: gid,
                    error_code: gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                    error_message: "onEditGroupName error, status:" + evt.status,
                    detail_message: "responseText:" + evt.responseText
                });
            }
        });
};

GizwitsJS.prototype._addGroupDevices = function(gid, dids) {
    var gizJS = this;
    var url = "https://{0}/app/group/{1}/devices".format(gizJS._apiHost, gid);
    var data = JSON.stringify({
        dids: dids
    });

    $.ajax(url, {
            type: "POST",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json",
            data: data
        })
        .done(function(result) {
            console.log("result = " + JSON.stringify(result));
            if (result.success.length > 0) {
                gizJS._updateGroupDevices(gid);
            } else {
                gizJS.onUpdateGroupDeviceList(null, {
                    group_id: gid,
                    error_code: gizJS._getErrorCode(result, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                    error_message: result.failed,
                    detail_message: result.detail_message
                });
            }
        })
        .fail(function(evt) {
            gizJS.onUpdateGroupDeviceList(null, {
                group_id: gid,
                error_code: gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                error_message: "onUpdateGroupDeviceList error, status:" + evt.status,
                detail_message: "responseText:" + evt.responseText
            });
        });
};

GizwitsJS.prototype._deleteGroupDevices = function(gid, dids) {
    var gizJS = this;
    var url = "https://{0}/app/group/{1}/devices".format(gizJS._apiHost, gid);
    var data = JSON.stringify({
        dids: dids
    });

    $.ajax(url, {
            type: "DELETE",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json",
            data: data
        })
        .done(function(result) {
            if (result.success.length > 0) {
                gizJS._updateGroupDevices(gid);
            } else {
                gizJS.onUpdateGroupDeviceList(null, {
                    group_id: gid,
                    error_code: ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED,
                    error_message: result.failed
                });
            }
        })
        .fail(function(evt) {
            gizJS.onUpdateGroupDeviceList(null, {
                group_id: gid,
                error_code: gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                error_message: "onUpdateGroupDeviceList error, status:" + evt.status,
                detail_message: "responseText:" + evt.responseText
            });
        });
};

GizwitsJS.prototype._updateGroupDevices = function(gid) {
    var gizJS = this;
    var url = "https://{0}/app/group/{1}/devices".format(gizJS._apiHost, gid);

    $.ajax(url, {
            type: "GET",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            var groupDevicesList = new Array();
            if (result) {
                for (var i = 0; i < result.length; i++) {
                    var groupInfo = result[i];
                    groupDevicesList[i] = {
                        "did": groupInfo.did,
                        "type": groupInfo.type,
                        "product_key": groupInfo.product_key,
                        "verbose_name": groupInfo.verbose_name,
                        "dev_alias": groupInfo.dev_alias
                    };
                }
            }
            gizJS.onUpdateGroupDeviceList({ group_id: gid, devices: groupDevicesList }, null);
        })
        .fail(function(evt) {
            gizJS.onUpdateGroupDeviceList(null, {
                group_id: gid,
                error_code: gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                error_message: "onUpdateGroupDeviceList error, status:" + evt.status,
                detail_message: "responseText:" + evt.responseText
            });
        });
};

GizwitsJS.prototype._groupWrite = function(gid, attrs, raw) {
    var gizJS = this;
    var url = "https://{0}/app/group/{1}/control".format(gizJS._apiHost, gid);
    var data = JSON.stringify({
        attrs: attrs,
        raw: raw
    });

    $.ajax(url, {
            type: "POST",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json",
            data: data
        })
        .done(function(result) {
            if (result.length > 0 && result[0].result === true) {
                gizJS.onGroupWrite({ group_id: gid });
            } else {
                gizJS.onGroupWrite(null, {
                    group_id: gid,
                    error_code: ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED
                });
            }
        })
        .fail(function(evt) {
            gizJS.onGroupWrite(null, {
                group_id: gid,
                error_code: gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                error_message: "onGroupWrite error, status:" + evt.status,
                detail_message: "responseText:" + evt.responseText
            });
        });
};


GizwitsJS.prototype._addScene = function(name, remark, tasks) {
    var gizJS = this;
    var url = "https://{0}/app/scene".format(gizJS._apiHost);
    var data = JSON.stringify({
        scene_name: name,
        remark: remark,
        tasks: tasks
    });

    $.ajax(url, {
            type: "POST",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json",
            data: data
        })
        .done(function(result) {
            gizJS._updateScenes();
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onUpdateSceneList,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "onUpdateSceneList error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._editSceneInfo = function(sid, name, remark, tasks) {
    var gizJS = this;
    var url = "https://{0}/app/scene/{1}".format(gizJS._apiHost, sid);
    var data = JSON.stringify({
        scene_name: name,
        remark: remark,
        tasks: tasks
    });

    $.ajax(url, {
            type: "PUT",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json",
            data: data
        })
        .done(function(result) {
            gizJS.onEditSceneInfo({ "scene_id": sid }, null);
        })
        .fail(function(evt) {
            if (evt.status == 200) {
                gizJS.onEditSceneInfo({ "scene_id": sid }, null);
            } else {
                gizJS._sendError(gizJS.onEditSceneInfo,
                    gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                    "onEditSceneInfo error, status:" + evt.status + ", responseText:" + evt.responseText);
            }
        });
};

GizwitsJS.prototype._deleteScene = function(sid) {
    var gizJS = this;
    var url = "https://{0}/app/scene/{1}".format(gizJS._apiHost, sid);

    $.ajax(url, {
            type: "DELETE",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            gizJS._updateScenes();
        })
        .fail(function(evt) {
            if (evt.status == 200) {
                gizJS._updateScenes();
            } else {
                gizJS._sendError(gizJS.onUpdateSceneList,
                    gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                    "onUpdateSceneList error, status:" + evt.status + ", responseText:" + evt.responseText);
            }
        });
};

GizwitsJS.prototype._updateScenes = function() {
    var gizJS = this;
    var url = "https://{0}/app/scene".format(gizJS._apiHost);

    $.ajax(url, {
            type: "GET",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            gizJS._sceneList = new Array();
            if (result) {
                for (var i = 0; i < result.length; i++) {
                    var sceneInfo = result[i];
                    gizJS._sceneList[i] = {
                        "scene_id": sceneInfo.id,
                        "scene_name": sceneInfo.scene_name,
                        "tasks": sceneInfo.tasks,
                        "remark": sceneInfo.remark
                    };
                }
                gizJS.onUpdateSceneList({ scenes: gizJS._sceneList });
            } else {
                gizJS.onUpdateSceneList(null, {
                    error_code: ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED
                });
            }
        })
        .fail(function(evt) {
            gizJS._sceneList = new Array();
            gizJS._sendError(gizJS.onUpdateSceneList,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "onUpdateSceneList error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._updateSceneStatus = function(sid) {
    var gizJS = this;
    var url = "https://{0}/app/scene/{1}/task".format(gizJS._apiHost, sid);

    $.ajax(url, {
            type: "GET",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            if (result) {
                gizJS.onUpdateSceneStatus({
                    scene_id: sid,
                    status: result.status
                });
            } else {
                gizJS.onUpdateSceneStatus(null, {
                    error_code: ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED
                });
            }
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onUpdateSceneStatus,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "onUpdateSceneStatus error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._executeScene = function(sid) {
    var gizJS = this;
    var url = "https://{0}/app/scene/{1}/task".format(gizJS._apiHost, sid);

    $.ajax(url, {
            type: "POST",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            gizJS.onExecuteScene({ "scene_id": sid }, null);
            gizJS._updateSceneStatus(sid);
        })
        .fail(function(evt) {
            if (evt.status == 200) {
                gizJS.onExecuteScene({ "scene_id": sid }, null);
                gizJS._updateSceneStatus(sid);
            } else {
                gizJS._sendError(gizJS.onExecuteScene,
                    gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                    "onExecuteScene error, status:" + evt.status + ", responseText:" + evt.responseText);
            }
        });
};

GizwitsJS.prototype._getBindingUsers = function(did) {
    var gizJS = this;
    var url = "https://{0}/app/{1}/bindings".format(gizJS._apiHost, did);

    $.ajax(url, {
            type: "GET",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            var bindUsers = new Array();
            for (var i = 0; i < result.length; i++) {
                var userInfo = result[i];
                bindUsers[i] = {
                    "uid": userInfo.uid,
                    "username": userInfo.username,
                    "email": userInfo.email,
                    "phone": userInfo.phone
                };
            }
            gizJS.onGetBindingUsers({ "did": did, "bindUsers": bindUsers }, null);
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onGetBindingUsers,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "onGetBindingUsers error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._unbindUser = function(did, uid) {
    var gizJS = this;
    var url = "https://{0}/app/{1}/bindings?uid={2}".format(gizJS._apiHost, did, uid);

    $.ajax(url, {
            type: "DELETE",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            gizJS.onUnbindUser({ "did": did }, null);
        })
        .fail(function(evt) {
            if (evt.status == 200) {
                gizJS.onUnbindUser({ "did": did }, null);
            } else {
                gizJS._sendError(gizJS.onUnbindUser,
                    gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                    "onUnbindUser error, status:" + evt.status + ", responseText:" + evt.responseText);
            }
        });
};

GizwitsJS.prototype._getDeviceSharingInfos = function(did, type) {
    var gizJS = this;
    var url = undefined;
    if (did) {
        url = "https://{0}/app/sharing?did={1}&sharing_type={2}&limit=100&skip=0".format(gizJS._apiHost, did, type);
    } else {
        url = "https://{0}/app/sharing?sharing_type={1}".format(gizJS._apiHost, type);
    }

    $.ajax(url, {
            type: "GET",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            var sharing_list = new Array();
            for (var i = 0; i < result.objects.length; i++) {
                var object = result.objects[i];
                sharing_list[i] = {
                    "id": object.id,
                    "type": object.type,
                    "uid": object.uid,
                    "username": object.username,
                    "user_alias": object.user_alias,
                    "email": object.email,
                    "phone": object.phone,
                    "did": object.did,
                    "product_name": object.product_name,
                    "dev_alias": object.dev_alias,
                    "status": object.status
                };
            }
            gizJS.onGetDeviceSharingInfos({ "did": did, "sharing_list": sharing_list }, null);
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onGetDeviceSharingInfos,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "onGetDeviceSharingInfos error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._sharingDevice = function(did, type, uid, username, email, phone) {
    var gizJS = this;
    var url = "https://{0}/app/sharing".format(gizJS._apiHost);
    var data = JSON.stringify({
        "type": type,
        "did": did,
        "uid": uid,
        "username": username,
        "email": email,
        "phone": phone
    });
    $.ajax(url, {
            type: "POST",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json",
            data: data
        })
        .done(function(result) {
            gizJS.onSharingDevice({ "id": result.id, "qr_content": result.qr_content }, null);
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onSharingDevice,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "onSharingDevice error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._revokeDeviceSharing = function(id) {
    var gizJS = this;
    var url = "https://{0}/app/sharing/{1}".format(gizJS._apiHost, id);
    $.ajax(url, {
            type: "DELETE",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            gizJS.onRevokeDeviceSharing({ "id": result.id }, null);
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onRevokeDeviceSharing,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "onRevokeDeviceSharing error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._acceptDeviceSharing = function(id, accept) {
    var gizJS = this;
    var url = "https://{0}/app/sharing/{1}?status={2}".format(gizJS._apiHost, id, accept);

    $.ajax(url, {
            type: "PUT",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            gizJS.onAcceptDeviceSharing({ "id": result.id }, null);
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onAcceptDeviceSharing,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "onAcceptDeviceSharing error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._checkDeviceSharingInfoByQRCode = function(code) {
    var gizJS = this;
    var url = "https://{0}/app/sharing/code/{1}".format(gizJS._apiHost, code);

    $.ajax(url, {
            type: "GET",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            gizJS.onCheckDeviceSharingInfoByQRCode({
                "owner": result.owner,
                "product_name": result.product_name,
                "dev_alias": result.dev_alias,
                "expired_at": result.expired_at
            }, null);
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onCheckDeviceSharingInfoByQRCode,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "onCheckDeviceSharingInfoByQRCode error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._acceptDeviceSharingByQRCode = function(code) {
    var gizJS = this;
    var url = "https://{0}/app/sharing/code/{1}".format(gizJS._apiHost, code);

    $.ajax(url, {
            type: "POST",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            gizJS.onAcceptDeviceSharingByQRCode({ "error_code": 0, "error_message": "GIZ_SDK_SUCCESS" }, null);
        })
        .fail(function(evt) {
            if (evt.status == 200) {
                gizJS.onAcceptDeviceSharingByQRCode({ "error_code": 0, "error_message": "GIZ_SDK_SUCCESS" }, null);
            } else {
                gizJS._sendError(gizJS.onAcceptDeviceSharingByQRCode,
                    gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                    "onAcceptDeviceSharingByQRCode error, status:" + evt.status + ", responseText:" + evt.responseText);
            }
        });
};

GizwitsJS.prototype._modifySharingInfo = function(id, user_alias) {
    var gizJS = this;
    var url = "https://{0}/app/sharing/{1}/alias?user_alias={2}".format(gizJS._apiHost, id, user_alias);

    $.ajax(url, {
            type: "PUT",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            gizJS.onModifySharingInfo({ "error_code": 0, "error_message": "GIZ_SDK_SUCCESS" }, null);
        })
        .fail(function(evt) {
            if (evt.status == 200) {
                gizJS.onModifySharingInfo({ "error_code": 0, "error_message": "GIZ_SDK_SUCCESS" }, null);
            } else {
                gizJS._sendError(gizJS.onModifySharingInfo,
                    gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                    "onModifySharingInfo error, status:" + evt.status + ", responseText:" + evt.responseText);
            }
        });
};

GizwitsJS.prototype._queryMessageList = function(type) {
    var gizJS = this;
    var url = "https://{0}/app/messages?type={1}&skip=0&limit=100".format(gizJS._apiHost, type);

    $.ajax(url, {
            type: "GET",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            var message_list = new Array();
            for (var i = 0; i < result.objects.length; i++) {
                var object = result.objects[i];
                message_list[i] = {
                    "id": object.id,
                    "type": object.type,
                    "status": object.status,
                    "content": object.content,
                    "created_at": object.created_at,
                    "updated_at": object.updated_at
                };
            }
            gizJS.onQueryMessageList({ "message_list": message_list }, null);
        })
        .fail(function(evt) {
            gizJS._sendError(gizJS.onQueryMessageList,
                gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                "onQueryMessageList error, status:" + evt.status + ", responseText:" + evt.responseText);
        });
};

GizwitsJS.prototype._markMessageStatus = function(id, status) {
    var gizJS = this;
    var url = "https://{0}/app/messages/{1}?status={2}".format(gizJS._apiHost, id, status);

    $.ajax(url, {
            type: "PUT",
            contentType: "application/json",
            headers: { "X-Gizwits-Application-Id": gizJS._appID, "X-Gizwits-User-token": gizJS._userToken },
            dataType: "json"
        })
        .done(function(result) {
            gizJS.onMarkMessageStatus({ "error_code": 0, "error_message": "GIZ_SDK_SUCCESS" }, null);
        })
        .fail(function(evt) {
            if (evt.status == 200) {
                gizJS.onMarkMessageStatus({ "error_code": 0, "error_message": "GIZ_SDK_SUCCESS" }, null);
            } else {
                gizJS._sendError(gizJS.onMarkMessageStatus,
                    gizJS._getErrorCode(evt, ERROR_CODE.GIZ_SDK_HTTP_REQUEST_FAILED),
                    "onMarkMessageStatus error, status:" + evt.status + ", responseText:" + evt.responseText);
            }
        });
};

//=========================================================
// websocket functions
//=========================================================
Connection.prototype._connectWS = function() {
    var conn = this;

    conn._stopPing();
    var websocket = new WebSocket(conn._wsUrl);
    websocket.onopen = function(evt) { conn._onWSOpen(evt) };
    websocket.onclose = function(evt) { conn._onWSClose(evt) };
    websocket.onmessage = function(evt) { conn._onWSMessage(evt) };
    websocket.onerror = function(evt) { conn._onWSError(evt) };

    conn._websocket = websocket;
};

Connection.prototype._onWSOpen = function(evt) {
    this._login();
};

Connection.prototype._onWSClose = function(evt) {
    this._stopPing();
    this._callbackObj._sendError(null,
        ERROR_CODE.GIZ_SDK_WEB_SOCKET_CLOSED,
        "Websocket Connect failed, please try again after a moment.");
};

Connection.prototype._onWSMessage = function(evt) {
    // console.info(evt);
    var res = JSON.parse(evt.data);
    switch (res.cmd) {
        case "pong":
            break;
        case "login_res":
            if (res.data.success === true) {
                this._loginFailedCount = 0;
                this._startPing();
                this._subscribeDevices();
            } else {
                this._tryLoginAgain();
            }
            break;
        case "subscribe_res":
            var failedDids = res.data.failed;
            var successDids = res.data.success;

            if (this._callbackObj.onSubscribeDevice) {
                for (var i = successDids.length - 1; i >= 0; i--) {
                    this._callbackObj.onSubscribeDevice({
                        did: successDids[i].did
                    });
                }
            }
            for (var j = failedDids.length - 1; j >= 0; j--) {
                this._removeSubscribeDid(failedDids[j].did);
                this._callbackObj._sendError(this._callbackObj.onSubscribeDevice,
                    ERROR_CODE.GIZ_SDK_SUBSCRIBE_FAILED,
                    "subscribe device failed, please try again(Websocket error_code: "
                    + failedDids[j].error_code + ", msg: " + failedDids[j].msg +  ").",
                    failedDids[j].did);
            }
            break;
        case "s2c_online_status":
            var device = this._callbackObj._boundDevices[res.data.did];
            if (device) {
                device.is_online = res.data.online;

                //先回调设备状态变化
                if (this._callbackObj.onDeviceOnlineStatusChanged) {
                    this._callbackObj.onDeviceOnlineStatusChanged({
                        did: device.did,
                        is_online: device.is_online
                    });
                }

                //中控变离线,其挂载的未绑定在线子设备也置为离线
                if (DEV_TYPE_CENTER_CONTROL === device.type && !device.is_online) {
                    if (this._callbackObj._subDevices[device.did]) {
                        for (var subDidFromCloud in this._callbackObj._subDevices[device.did]) {
                            if (!this._callbackObj._boundDevices[subDidFromCloud]) {
                                var subDevice = this._callbackObj._subDevices[device.did][subDidFromCloud];
                                if (subDevice.is_online != false) {
                                    subDevice.is_online = false;
                                    if (this._callbackObj.onDeviceOnlineStatusChanged) {
                                        this._callbackObj.onDeviceOnlineStatusChanged({
                                            did: subDevice.did,
                                            is_online: subDevice.is_online
                                        });
                                    }
                                    this._callbackObj._onUpdateSubDevices(device.did, true);
                                }
                            }
                        }
                    };
                }

                //再回调设备列表变化
                if (this._callbackObj.onDiscoverDevices) {
                    this._callbackObj._onDiscoverDevices(this._callbackObj.onDiscoverDevices);
                }
            }
            break;
        case "s2c_raw":
            var action = undefined;
            var actionP0 = [];
            var did = res.data.did.substr(0, LEN_DID); //Websocket有BUG,res.data.did类似vPGH2Kew5nbZiUwQKP6qiF/usr57701494432320735193,故需要截取
            var device = this._callbackObj._boundDevices[did];
            if (device) {
                //长度字段所占长度不定
                var addIndex = 0;
                for (var i = 4; i < res.data.raw.length; i++) {
                    if (res.data.raw[i] & 0x80) {
                        ++addIndex;
                    } else {
                        break;
                    }
                }

                if (CMD_TRANS_BUSINESS_RESP === res.data.raw[7 + addIndex]) {
                    action = res.data.raw[12 + addIndex];
                    actionP0 = res.data.raw.slice(13 + addIndex);
                } else {
                    action = res.data.raw[8 + addIndex];
                    actionP0 = res.data.raw.slice(9 + addIndex);
                }

                if (P0_CMD_REPORT_SUBDEVICE_STATUS === action) {
                    this._callbackObj._processSubdeviceOnlineReport(did, actionP0);
                    this._callbackObj._onUpdateSubDevices(did, true);
                } else if (P0_CMD_GET_SUBDEVICE_LIST_RESP === action || P0_CMD_REPORT_SUBDEVICE_LIST === action) {
                    this._callbackObj._processSubdevicesReport(did, actionP0);
                    this._callbackObj._onUpdateSubDevices(did, true);
                } else if (P0_CMD_ADD_SUBDEVICE_RESP === action) {
                    if (actionP0[0]) {
                        if (this._callbackObj.onUpdateSubDevices) {
                            this._callbackObj._sendError(this._callbackObj.onUpdateSubDevices,
                                GIZ_SDK_SUBDEVICE_ADD_FAILED,
                                "add subDevice for center control device failed",
                                did);
                        }
                    } else {
                        this._callbackObj._onUpdateSubDevices(did, false);
                    }
                } else if (P0_CMD_DELETE_SUBDEVICE_RESP === action) {
                    if (actionP0[0]) {
                        console.log("center control device " + did + " delete subDevice failed");
                    } else {
                        console.log("center control device " + did + " delete subDevice success");
                    }
                } else {
                    if (this._callbackObj.onReceiveData) {
                        this._callbackObj.onReceiveData({
                            did: device.did,
                            raw: res.data.raw
                        });
                    }
                }
            }
            break;
        case "s2c_noti":
            var device = this._callbackObj._boundDevices[res.data.did];
            if (this._callbackObj.onReceiveData && device) {
                this._callbackObj.onReceiveData({
                    did: device.did,
                    attrs: res.data.attrs
                });
            }
            break;
        case "s2c_invalid_msg":
            var errorCode = res.data.error_code;
            if (1009 === errorCode) {
                this._tryLoginAgain();
            } else {
                this._callbackObj._sendError(null,
                    ERROR_CODE.GIZ_SDK_WEB_SOCKET_INVALID,
                    "ErrorCode " + errorCode + ": " + res.data.msg + ", did = " + res.data.did);
            }
            break;
    }
};

Connection.prototype._onWSError = function(evt) {
    this._callbackObj._sendError(null,
        ERROR_CODE.GIZ_SDK_WEB_SOCKET_ERROR,
        "Websocket on error");
};

Connection.prototype._startPing = function() {
    var conn = this;
    if (!conn._heartbeatTimerID) {
        var heartbeatInterval = conn._callbackObj._heartbeatInterval * 1000;
        conn._heartbeatTimerID = window.setInterval(function() { conn._sendJson({ cmd: "ping" }); }, heartbeatInterval);
    }
};

Connection.prototype._stopPing = function() {
    if (this._heartbeatTimerID) {
        window.clearInterval(this._heartbeatTimerID);
        this._heartbeatTimerID = null;
    }
};

Connection.prototype._sendJson = function(json) {
    var data = JSON.stringify(json);
    var websocket = this._websocket;
    if (websocket.OPEN === websocket.readyState) {
        websocket.send(data);
        return true;
    } else {
        console.log("[" + Date() + "]Send data " + data + " error, websocket is not connected.");
        this._callbackObj._sendError(null,
            ERROR_CODE.GIZ_SDK_WEB_SOCKET_INVALID,
            "Websocket is not connected, please try to subscribe device again");
        this._stopPing();
        return false;
    }
};

//=========================================================
// helper functions
//=========================================================
Connection.prototype._login = function() {
    var keepalive = this._callbackObj._keepalive;
    var json = {
        cmd: "login_req",
        data: {
            appid: this._callbackObj._appID,
            uid: this._callbackObj._userID,
            token: this._callbackObj._userToken,
            p0_type: P0_TYPE_ATTRS_V4, //attr_v4模式兼容Datapoint跟Raw
            heartbeat_interval: keepalive, // default 180s
            auto_subscribe: false //按需定阅设备以节省开销
        }
    };
    this._sendJson(json);
};

Connection.prototype._tryLoginAgain = function() {
    var conn = this;
    conn._loginFailedCount += 1;
    if (conn._loginFailedCount > 3) {
        conn._websocket.close();
        return;
    }
    var waitTime = conn._loginFailedCount * RETRY_WAIT_TIME;
    window.setTimeout(function() { conn._login() }, waitTime);
};

Connection.prototype._addSubscribeDid = function(did) {
    this._subscribedDids[did] = did;
};

Connection.prototype._removeSubscribeDid = function(did) {
    delete this._subscribedDids[did];
};

Connection.prototype._subscribeDevice = function(did) {
    var json = {
        cmd: "subscribe_req",
        data: [{ did: did }]
    };
    this._sendJson(json);
};

Connection.prototype._subscribeDevices = function() {
    var reqData = [];
    for (var key in this._subscribedDids) {
        reqData.push({ did: this._subscribedDids[key] });
    }
    var json = {
        cmd: "subscribe_req",
        data: reqData
    };
    this._sendJson(json);
};

GizwitsJS.prototype._onDiscoverDevices = function(callback) {
    if (callback) {
        var i = 0;
        var devices = [];

        //先存入已绑定(子)设备
        for (var key in this._boundDevices) {
            var device = this._boundDevices[key];
            var conn = this._connections[this._getWebsocketConnInfo(device)];
            var isSubscribe = conn ? !!conn._subscribedDids[device.did] : false;
            devices[i++] = {
                "is_bind": true,
                "did": device.did,
                "mac": device.mac,
                "remark": device.remark,
                "alias": device.dev_alias,
                "is_subscribe": isSubscribe,
                "is_online": device.is_online,
                "product_key": device.product_key,
                "type": this._getDevTypeByStr(device.type),
                "role": this._getDevRoleByStr(device.role)
            };
        }

        //再合并未绑定子设备
        for (var key in this._subDevices) {
            for (var subDidFromCloud in this._subDevices[key]) {
                if (!this._boundDevices[subDidFromCloud]) {
                    var device = this._subDevices[key][subDidFromCloud];
                    devices[i++] = {
                        "is_bind": false,
                        "did": device.did,
                        "mac": device.mac,
                        "remark": "",
                        "alias": "",
                        "is_subscribe": false,
                        "is_online": device.is_online,
                        "product_key": device.product_key,
                        "type": this._getDevTypeByStr(DEV_TYPE_SUB),
                        "role": this._getDevRoleByStr(device.role)
                    };
                }
            }
        }

        callback({ devices: devices }, null);
    }
}

GizwitsJS.prototype._getDevTypeByStr = function(typeStr) {
    var type = 0;

    if (DEV_TYPE_CENTER_CONTROL === typeStr) {
        type = 1;
    } else if (DEV_TYPE_SUB === typeStr) {
        type = 2;
    } else {
        type = 0;
    }

    return type;
}

GizwitsJS.prototype._getDevRoleByStr = function(roleStr) {
    var role = 0;

    if (DEV_ROLE_SPECIAL === roleStr) {
        role = 0;
    } else if (DEV_ROLE_OWNER === roleStr) {
        role = 1;
    } else if (DEV_ROLE_GUEST === roleStr) {
        role = 2;
    } else {
        role = 3;
    }

    return role;
}

GizwitsJS.prototype._sendJson = function(device, json) {
    //找到设备传输数据的Websocket连接
    var conn = this._connections[this._getWebsocketConnInfo(device)];
    if (!conn) {
        this._sendError(null,
            ERROR_CODE.GIZ_SDK_WEB_SOCKET_INVALID,
            "Websocket is not connected, please try to subscribe device again",
            device.did);
        return;
    }

    if (!conn._sendJson(json)) {
        if (Date.now() - conn._lastConnectMilliTimestamp > RETRY_WAIT_TIME) {
            console.log("[" + Date() + "]Send data error, try to connect again.");
            this._connect(device);
            conn._lastConnectMilliTimestamp = Date.now();
            window.setTimeout(function() { conn._login() }, RETRY_SEND_TIME);
        }
    }
}

GizwitsJS.prototype._connect = function(device) {
    var wsInfo = this._getWebsocketConnInfo(device);
    var conn = this._connections[wsInfo];
    if (!conn) {
        conn = new Connection(wsInfo, this);
    }
    conn._addSubscribeDid(device.did);
    conn._connectWS();
    this._connections[wsInfo] = conn;
}

GizwitsJS.prototype._getErrorCode = function(evt, code) {
    var errorCode = code;
    if (evt.responseText) {
        var json = JSON.parse(evt.responseText);
        var newCode = json.error_code;
        if (newCode) {
            errorCode = newCode;
        }
    }
    return errorCode;
};

GizwitsJS.prototype._sendError = function(callback, code, msg, did) {
    if (callback) {
        if (did) {
            callback(null, {
                error_code: code,
                error_message: msg,
                did: did
            });
        } else {
            callback(null, {
                error_code: code,
                error_message: msg,
            });
        }
    } else if (this.onEventNotify) {
        if (did) {
            this.onEventNotify({
                event_id: code,
                event_content: {
                    detail: msg,
                    did: did
                }
            });
        } else {
            this.onEventNotify({
                event_id: code,
                event_content: {
                    detail: msg
                }
            });
        }
    }
};

GizwitsJS.prototype._getWebsocketConnInfo = function(device) {
    var pre = "ws://";
    var host = device.host;
    var port = device.ws_port + '';

    if (device.wss_port) {
        pre = "wss://";
        port = device.wss_port + '';
    }

    return pre + host + ":" + port;
};

GizwitsJS.prototype._getMQTTLenArray = function(len) {
    var digitNum = 0;
    var tmpDigit = len;
    var MQTTLenArray = new Array();

    if (len <= 0) return MQTTLenArray;

    do {
        //左移位运算符>>变相将浮点类型转为整型,效率高于Math.ceil或Math.floor且不用区分正负
        if (tmpDigit / 0x80 >> 0) {
            MQTTLenArray[digitNum++] = tmpDigit % 0x80 | 0x80;
        } else {
            MQTTLenArray[digitNum++] = tmpDigit % 0x80;
        }
        tmpDigit = (tmpDigit / 0x80 >> 0);
    } while (tmpDigit);

    return MQTTLenArray;
}

GizwitsJS.prototype._processSubdevicesReport = function(did, raw) {
    this._subDevices[did] = {}; //清空子设备列表缓存
    var index = 0;
    var data = new Uint8Array(raw.length);
    data.set(raw, 0);
    var dataView = new DataView(data.buffer);
    var productNum = dataView.getUint16(index); //得到产品个数
    index += 2;
    for (var i = 0; i < productNum; ++i) {
        var productKey = raw.bin2string(index, LEN_PRODUCT_KEY); //得到产品标识
        index += LEN_PRODUCT_KEY;
        var subDevicesNum = dataView.getUint16(index); //得到该产品标识对应的子设备个数
        index += 2;
        for (var j = 0; j < subDevicesNum; ++j) {
            var subDevice = {};
            subDevice.subDid = dataView.getUint32(index); //得到子设备标识码
            index += 4;
            subDevice.is_online = !!raw[index++]; //得到子设备在线状态
            var lenMAC = raw[index++];
            subDevice.mac = raw.bin2string(index, lenMAC); //得到子设备识别码
            index += lenMAC;
            subDevice.did = raw.bin2string(index, LEN_DID); //得到云端分配的子设备标识码
            index += LEN_DID;
            subDevice.product_key = productKey; //得到子设备产品标识

            this._subDevices[did][subDevice.did] = subDevice;
        }
    }
}

GizwitsJS.prototype._processSubdeviceOnlineReport = function(did, raw) {
    var index = 0;
    var data = new Uint8Array(raw.length);
    data.set(raw, 0);
    var dataView = new DataView(data.buffer);
    var subDid = dataView.getUint32(index); //得子设备标识码
    index += 4;

    //找到匹配的子设备
    for (var key in this._subDevices[did]) {
        if (this._subDevices[did][key].subDid === subDid) {
            this._subDevices[did][key].is_online = !!raw[index];
            break;
        }
    }
}

GizwitsJS.prototype._onUpdateSubDevices = function(did, updateBoundDevices) {
    if (!this.onUpdateSubDevices) {
        return;
    }

    var i = 0;
    var subDevices = [];
    for (var key in this._subDevices[did]) {
        subDevices[i++] = {
            "did": this._subDevices[did][key].did,
            "mac": this._subDevices[did][key].mac,
            "is_online": this._subDevices[did][key].is_online,
            "product_key": this._subDevices[did][key].product_key
        };
    }
    this.onUpdateSubDevices({
        did: did,
        subDevices: subDevices
    });

    //获取一次绑定设备列表同步绑定信息
    if (updateBoundDevices) {
        this._getBoundDevices(GET_BOUND_DEV_ONE_STEP_LIMIT, 0);
    }
}

/**
 * 将整型数组从指定偏移位置开始的指定长度内容转换成字符串(例如[0,0,65,66,67,68].bin2string(2, 3)转换成"ABC")
 * 
 * @param  {Number} index 指定偏移位置
 * @param  {Number} len   指定长度
 * @return {String} 格式化之后的字符串
 */
Array.prototype.bin2string = function(index, len) {
    var str = "";

    for (var i = 0; i < len; i++) {
        //遇到0则结束
        if (!this[index + i]) {
            break;
        }
        str += String.fromCharCode(this[index + i]);
    }

    return str;
}

/**
 * 字符串格式化打印函数
 *
 * @return {String} 格式化之后的字符串
 */
String.prototype.format = function() {
    var args = arguments;
    return this.replace(/\{(\d+)\}/g,
        function(m, i) {
            return args[i];
        });
};

//=========================================================
// MD5 functions
//=========================================================
function hexMD5(s) {
    return binl2hex(coreMD5(str2binl(s), s.length * CHAR_SIZE));
}

function coreMD5(x, len) {
    x[len >> 5] |= 0x80 << ((len) % 32);
    x[(((len + 64) >>> 9) << 4) + 14] = len;

    var a = 1732584193;
    var b = -271733879;
    var c = -1732584194;
    var d = 271733878;

    for (var i = 0; i < x.length; i += 16) {
        var olda = a;
        var oldb = b;
        var oldc = c;
        var oldd = d;

        a = md5FF(a, b, c, d, x[i + 0], 7, -680876936);
        d = md5FF(d, a, b, c, x[i + 1], 12, -389564586);
        c = md5FF(c, d, a, b, x[i + 2], 17, 606105819);
        b = md5FF(b, c, d, a, x[i + 3], 22, -1044525330);
        a = md5FF(a, b, c, d, x[i + 4], 7, -176418897);
        d = md5FF(d, a, b, c, x[i + 5], 12, 1200080426);
        c = md5FF(c, d, a, b, x[i + 6], 17, -1473231341);
        b = md5FF(b, c, d, a, x[i + 7], 22, -45705983);
        a = md5FF(a, b, c, d, x[i + 8], 7, 1770035416);
        d = md5FF(d, a, b, c, x[i + 9], 12, -1958414417);
        c = md5FF(c, d, a, b, x[i + 10], 17, -42063);
        b = md5FF(b, c, d, a, x[i + 11], 22, -1990404162);
        a = md5FF(a, b, c, d, x[i + 12], 7, 1804603682);
        d = md5FF(d, a, b, c, x[i + 13], 12, -40341101);
        c = md5FF(c, d, a, b, x[i + 14], 17, -1502002290);
        b = md5FF(b, c, d, a, x[i + 15], 22, 1236535329);

        a = md5GG(a, b, c, d, x[i + 1], 5, -165796510);
        d = md5GG(d, a, b, c, x[i + 6], 9, -1069501632);
        c = md5GG(c, d, a, b, x[i + 11], 14, 643717713);
        b = md5GG(b, c, d, a, x[i + 0], 20, -373897302);
        a = md5GG(a, b, c, d, x[i + 5], 5, -701558691);
        d = md5GG(d, a, b, c, x[i + 10], 9, 38016083);
        c = md5GG(c, d, a, b, x[i + 15], 14, -660478335);
        b = md5GG(b, c, d, a, x[i + 4], 20, -405537848);
        a = md5GG(a, b, c, d, x[i + 9], 5, 568446438);
        d = md5GG(d, a, b, c, x[i + 14], 9, -1019803690);
        c = md5GG(c, d, a, b, x[i + 3], 14, -187363961);
        b = md5GG(b, c, d, a, x[i + 8], 20, 1163531501);
        a = md5GG(a, b, c, d, x[i + 13], 5, -1444681467);
        d = md5GG(d, a, b, c, x[i + 2], 9, -51403784);
        c = md5GG(c, d, a, b, x[i + 7], 14, 1735328473);
        b = md5GG(b, c, d, a, x[i + 12], 20, -1926607734);

        a = md5HH(a, b, c, d, x[i + 5], 4, -378558);
        d = md5HH(d, a, b, c, x[i + 8], 11, -2022574463);
        c = md5HH(c, d, a, b, x[i + 11], 16, 1839030562);
        b = md5HH(b, c, d, a, x[i + 14], 23, -35309556);
        a = md5HH(a, b, c, d, x[i + 1], 4, -1530992060);
        d = md5HH(d, a, b, c, x[i + 4], 11, 1272893353);
        c = md5HH(c, d, a, b, x[i + 7], 16, -155497632);
        b = md5HH(b, c, d, a, x[i + 10], 23, -1094730640);
        a = md5HH(a, b, c, d, x[i + 13], 4, 681279174);
        d = md5HH(d, a, b, c, x[i + 0], 11, -358537222);
        c = md5HH(c, d, a, b, x[i + 3], 16, -722521979);
        b = md5HH(b, c, d, a, x[i + 6], 23, 76029189);
        a = md5HH(a, b, c, d, x[i + 9], 4, -640364487);
        d = md5HH(d, a, b, c, x[i + 12], 11, -421815835);
        c = md5HH(c, d, a, b, x[i + 15], 16, 530742520);
        b = md5HH(b, c, d, a, x[i + 2], 23, -995338651);

        a = md5II(a, b, c, d, x[i + 0], 6, -198630844);
        d = md5II(d, a, b, c, x[i + 7], 10, 1126891415);
        c = md5II(c, d, a, b, x[i + 14], 15, -1416354905);
        b = md5II(b, c, d, a, x[i + 5], 21, -57434055);
        a = md5II(a, b, c, d, x[i + 12], 6, 1700485571);
        d = md5II(d, a, b, c, x[i + 3], 10, -1894986606);
        c = md5II(c, d, a, b, x[i + 10], 15, -1051523);
        b = md5II(b, c, d, a, x[i + 1], 21, -2054922799);
        a = md5II(a, b, c, d, x[i + 8], 6, 1873313359);
        d = md5II(d, a, b, c, x[i + 15], 10, -30611744);
        c = md5II(c, d, a, b, x[i + 6], 15, -1560198380);
        b = md5II(b, c, d, a, x[i + 13], 21, 1309151649);
        a = md5II(a, b, c, d, x[i + 4], 6, -145523070);
        d = md5II(d, a, b, c, x[i + 11], 10, -1120210379);
        c = md5II(c, d, a, b, x[i + 2], 15, 718787259);
        b = md5II(b, c, d, a, x[i + 9], 21, -343485551);

        a = safeAdd(a, olda);
        b = safeAdd(b, oldb);
        c = safeAdd(c, oldc);
        d = safeAdd(d, oldd);
    }

    return Array(a, b, c, d);
}

function md5CMN(q, a, b, x, s, t) {
    return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}

function md5FF(a, b, c, d, x, s, t) {
    return md5CMN((b & c) | ((~b) & d), a, b, x, s, t);
}

function md5GG(a, b, c, d, x, s, t) {
    return md5CMN((b & d) | (c & (~d)), a, b, x, s, t);
}

function md5HH(a, b, c, d, x, s, t) {
    return md5CMN(b ^ c ^ d, a, b, x, s, t);
}

function md5II(a, b, c, d, x, s, t) {
    return md5CMN(c ^ (b | (~d)), a, b, x, s, t);
}

function safeAdd(x, y) {
    var lsw = (x & 0xFFFF) + (y & 0xFFFF);
    var msw = (x >> 16) + (y >> 16) + (lsw >> 16);

    return (msw << 16) | (lsw & 0xFFFF);
}

function bitRol(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt));
}

function str2binl(str) {
    var bin = Array();
    var mask = (1 << CHAR_SIZE) - 1;

    for (var i = 0; i < str.length * CHAR_SIZE; i += CHAR_SIZE) {
        bin[i >> 5] |= (str.charCodeAt(i / CHAR_SIZE) & mask) << (i % 32);
    }

    return bin;
}

function binl2hex(binarray) {
    var str = "";
    var hexTable = "0123456789abcdef";

    for (var i = 0; i < binarray.length * 4; i++) {
        str += hexTable.charAt((binarray[i >> 2] >> ((i % 4) * 8 + 4)) & 0xF) +
            hexTable.charAt((binarray[i >> 2] >> ((i % 4) * 8)) & 0xF);
    }

    return str;
}