smzdmplus非官方强力版
=========

smzdm.com上firefox的推送扩展，官方版实在太难用了，一年都没更新过，和chrome的插件比简直...<br/>
这两天闲得蛋疼,比到官方chrome版写了个，基本实现了chrome绝大部分功能。

类似chrome的推送提示,需要先安装[tab-notifier](https://addons.mozilla.org/en-US/firefox/addon/tab-notifier/)扩展, 如没有装也没关系，扩展将使用ff原生接口自带的通知窗口提示。<br/>
1，tab-notifer通知窗口的设置在tab-notifer扩展选项中设置，如：自动关闭时间，大小（这个感觉差异不大），位置等, <br/>
2, tab-notifer扩展自身功能就是根据页面标题变化来弹出通知窗口，如果不需要可以屏蔽掉(网站通知行为'拒绝',标题监视行为'忽略'),此选项不影响smzdmplus的通知弹出 <br/>
3, 如果实在觉得tab-notifer的弹出窗口大小，可以自己修改下tab-notifer的css（下载tab-notifer(tab-notifer.xpi)，用winrar打开，修改/content/alert/alert.css,然后安装修改后的xpi即可）,这里提供一份自用的css
[alert.css](http://github.com/chenxiaolei/smzdmplus/raw/master/snapshot/alert.css)  <br/>
4，ff原生接口目前通知窗口不能堆叠通知窗口,一次只能显示一个，且3秒自动消失，无法设置 <br/>

最新扩展在此[smzdmplus.xpi](http://github.com/chenxiaolei/smzdmplus/raw/master/smzdmplus.xpi) 
>>>
- 20140522 v0.2.2
现在显示弹出面板时,内容部分滚动条自动回到顶部
- 20140521 v0.2.1
修正无法保存配置的bug
- 20140521 v0.2
可以进入配置界面了,推送过滤可用

最低要求是ff21, 自己是win7的ff29,理论上mac,linux都可以,没测试

有问题邮poison7@yeah.net<br/>
不保证回复

截图
----------

### 展示窗口
![Image text1](http://raw.github.com/chenxiaolei/smzdmplus/master/snapshot/1.png)

### 配置选项
![Image text1](http://raw.github.com/chenxiaolei/smzdmplus/master/snapshot/3.png)

### tab notifier 推送提示
![Image text2](http://github.com/chenxiaolei/smzdmplus/raw/master/snapshot/2.png)

### ff自带推送提示
![Image text2](http://github.com/chenxiaolei/smzdmplus/raw/master/snapshot/4.png)<br/>
一次收到多个推送,合并只显示数量<br/>
![Image text2](http://github.com/chenxiaolei/smzdmplus/raw/master/snapshot/5.png)
