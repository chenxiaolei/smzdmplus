smzdmplus无聊自制版
=========

smzdm.com上firefox的推送扩展，官方版实在太难用了，一年都没更新过，和chrome的插件比简直...<br/>
这两天闲得蛋疼,比到官方chrome版写了个，基本实现了chrome绝大部分功能。

类似chrome的推送提示,需要先安装[tab-notifier](https://addons.mozilla.org/en-US/firefox/addon/tab-notifier/)扩展<br/>
不然就使用ff自带的<br/>
ps: 
1，tab-notifer通知窗口的设置在tab-notifer扩展选项中设置(如:自动关闭事件,大小,位置等), <br/>
2，ff原生接口目前通知窗口不能堆叠通知窗口,一次只能显示一个，且3秒自动消失，无法设置

扩展在此[smzdmplus.xpi](http://github.com/chenxiaolei/smzdmplus/raw/master/smzdmplus.xpi) 

20140521更新
可以进入配置界面了,推送过滤可用

- 最低要求是ff21, 自己是win7的ff29,理论上mac,linux都可以,没测试

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
