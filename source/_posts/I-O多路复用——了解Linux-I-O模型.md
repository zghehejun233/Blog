---
title: I/O多路复用——了解Linux I/O模型
description: 聊一聊多路复用问题所涉及的Linux I/O模型。
date: 2024-01-27 01:02:43
tags:
  - 服务端
  - Linux
  - 计算机网络
categories: 
  - 技术
plugins:
  - indent
  - snackbar: updating
---

## 简述

### 面试相关

I/O多路复用问题算是服务端开发面试中一个比较常见的问题，在牛客以“多路复用”为关键词搜索可以找到不少面经，大概有这么几个问题：

- 基本问题，例如介绍多路复用/比较几种I/O模型/多路复用的优缺点等等
- HTTP的多路复用
  > 显然这个问题与本文没啥关系，HTTP的多路复用是指HTTP/2的多路复用，HTTP/2的多路复用是基于TCP的，而本文讨论的多路复用是指Linux的多路复用，是基于文件描述符的。
- select/poll/epoll的区别
  > 这个问题其实是对多路复用的实现方式的问题，本文会在后面详细讨论。
- 使用了多路复用机制的常见中间件，例如Redis、Nginx等等。

要应付面试中的这些问题，笔者认为需要掌握的内容并不算很多，而且比较有条理。个人建议准备一下内容：

1. 介绍多路复用的概念，以及多路复用的优缺点。
2. 熟悉Linux的I/O模型，以及select/poll/epoll的区别，包括BIO、NIO、AIO的区别。
3. 能够以Redis、Netty等常见中间件为例，介绍多路复用的使用场景。

### I/O基本问题

在开始本文的内容前，我们需要先了解“I/O”的一系列相关知识。

首先，I/O操作是编程时经常会遇到的问题，I/O操作的本质是数据的输入和输出，例如从文件中读取数据、向文件中写入数据、从网络中读取数据、向网络中写入数据等等。I/O操作的本质是数据的输入和输出，而数据的输入和输出是需要时间的，因此I/O操作是一个耗时的操作，而且I/O操作的耗时是不确定的，这是因为I/O操作的耗时与I/O设备的性能、I/O设备的负载、I/O操作的数据量等等都有关系。

在计算机组成原理课程中，应该比较过I/O设备与CPU的速度差异，I/O设备的速度远远低于CPU的速度，因此CPU在执行I/O操作时，会出现等待的情况，这种情况称为“阻塞”。阻塞的情况下，CPU会一直等待I/O操作完成，这样CPU的时间就浪费了。因此，各种I/O模型要解决的问题就是如何让CPU在I/O操作时不阻塞，而是去做其他的事情。

首先，在硬件层面上已经有DMA等技术来解决这个问题，，而在软件层面上，我们可以通过多线程、多进程、多路复用等技术来解决这个问题，这些技术都是在软件层面上解决的，而且这些技术都是通用的。

其中，多路复用是一种比较常见的技术，它的本质是通过一个线程来监听多个文件描述符，当某个文件描述符就绪时，就通知线程，线程就可以去处理这个文件描述符了。多路复用的优点是可以减少线程的数量，从而减少线程切换的开销，提高CPU的利用率，而且多路复用的实现方式是通用的，可以用于各种I/O设备，例如文件、网络等等。

为了更好的学习相关技术，我们还需要引入同步/异步、阻塞/非阻塞等概念。

#### 同步与异步

同步（Synchronous）与异步（Asynchronous）是指I/O操作的调用方式。

在同步操作中，I/O操作的调用者会一直等待I/O操作完成在执行后面的操作，而在异步操作中，I/O操作的调用者不会等待I/O操作完成，而是通过回调函数等方式来处理I/O操作的结果。同步与异步的区别在于使用一个指令进行I/O操作时，指令的执行者是否需要等待I/O操作完成。以下面这段伪代码为例：

```c
// 同步操作
result = do_io();
// 处理result

// 异步操作
do_io(callback);
// 其他操作
```

在同步操作中，指令的执行者会一直等待I/O操作完成，也就是`do_io()`函数的调用者会一直等待`do_io()`函数执行完成，然后执行`// 处理result`这一行代码。而在异步操作中，`do_io()`函数的调用者不会等待`do_io()`函数执行完成，而是直接执行`// 其他操作`这一行代码，当`do_io()`函数执行完成后再执行`callback`函数。

#### 阻塞与非阻塞

阻塞（Blocking）与非阻塞（Non-blocking）是指I/O操作的执行方式。

在阻塞操作中，CPU会一直等待I/O操作完成，而在非阻塞操作中，CPU不会等待I/O操作完成，而是去做其他的事情。阻塞/非阻塞描述的是进行IO操作时处理机的状态，对于一个同步操作而言，该操作有可能是阻塞也可能是非阻塞的，而对于一个异步操作而言，该操作一定是非阻塞的。

对于一个阻塞等待的操作，CPU会一直等待，直到IO操作完成才继续执行后续代码。在阻塞状态下，程序无法进行其他任务，会一直停留在等待IO操作的过程中。

#### 文件描述符

Linux的I/O操作是通过文件描述符来实现的，文件描述符是一个非负整数，它是一个索引值，指向内核中的一个打开文件的记录表。当程序打开一个现有文件或者创建一个新文件时，内核向进程返回一个文件描述符。在程序设计中，文件描述符是一个抽象概念，它是一个与具体I/O设备无关的抽象概念，它可以指向任何类型的I/O设备，例如文件、网络等等。

### I/O多路复用介绍

通过前面的介绍，我们应该认识到“同步/异步关注的是消息通知的机制，而阻塞/非阻塞关注的是程序（线程）等待消息通知时的状态”这个基本的概念。而多路复用是一种**同步、非阻塞**的I/O模型，它的本质是通过一个线程来监听多个文件描述符，当某个文件描述符就绪时，就通知线程，线程就可以去处理这个文件描述符了。

对于一次IO的过程，我们还需要知道在Linux中文件、网络都是以文件描述符的形式存在的。当我们打开一个文件时，内核会返回一个文件描述符，当我们打开一个网络连接时，内核也会返回一个文件描述符。而IO操作获得的数据也并不是直接返回给用户的，而是先写入内核的缓冲区，然后再从内核的缓冲区中读取数据。因此，我们可以把IO操作分为两个阶段：

1. 等待数据准备好
2. 将数据从内核缓冲区拷贝到用户缓冲区

多路复用关心的是第一个阶段，也就是等待数据准备好的阶段，而第二个阶段是由用户线程来完成的。

引入多路复用技术后，原本需要一个独立线程来完成的一个普通的同步阻塞IO操作，现在可以通过一个线程来完成多个IO操作，这样就减少了线程的数量，从而减少了线程切换的开销，提高了CPU的利用率。

## Linux I/O模型

Linux中共有5种I/O模型，分别是：

- 阻塞I/O（Blocking I/O）
- 非阻塞I/O（Non-blocking I/O）
- I/O复用（I/O multiplexing）
  > 包括select、poll、epoll。
- 信号驱动I/O（Signal driven I/O）
  > 信号驱动I/O是一种比较少见的I/O模型，本文不会详细介绍，典型的应用是SIGIO信号。
- 异步I/O（Asynchronous I/O）
  > POSIX的`aio_`系列函数。

> 另一种常常遇到的说法（AIO、BIO、NIO）本身并不准确。AIO、BIO和NIO是Java中的概念，本文讨论的是Linux的I/O模型，因此本文不会使用AIO、BIO和NIO这些概念，但会在后面的内容中介绍Java中的AIO、BIO和NIO。

实际应用中，我们常常会使用多种I/O模型，例如Nginx中就同时使用了阻塞I/O和I/O复用，而Redis中则同时使用了阻塞I/O、I/O复用和异步I/O。

### Blocking I/O

![Blocking I/O](https://s2.loli.net/2024/02/02/VOz3XMn8rcawsSi.png)

阻塞IO顾名思义，当程序向 Kernel 发起 System call `read()`时，进程此时阻塞，等待数据就绪(Kernel 读取数据到 Kernel space)。

对于本地磁盘IO，Blocking IO性能不会有太大问题；但是对于Socket IO，由于Socket数据的传输速度远低于本地磁盘，因此线程不得不长时间等待数据的到来。在这种I/O模型下，我们不得不为每一个Socket都分配一个线程，这会造成很大的资源浪费。

### Non-blocking I/O

![Non-Blocking I/O](https://s2.loli.net/2024/02/02/Y68lvXiwF9V2MaJ.png)

相对于阻塞I/O在那傻傻的等待，非阻塞I/O隔一段时间就发起 System call 看数据是否就绪(`ready`)。如果数据就绪，就从 Kernel space 复制到 user space，操作数据; 如果还没就绪，Kernel 会立即返回`EWOULDBLOCK`这个错误。

Non-blocking I/O 的优势在于，进程发起I/O操作时，不会因为数据还没就绪而阻塞，这就是”非阻塞”的含义。但这种I/O模型缺陷过于明显。在本地I/O，Kernel 读取数据很快，这种模式下多了至少一次 System call，而 System Call 是比较消耗CPU的操作。对于Socket而言，大量的 System call 更是这种模型显得很鸡肋。

> 之所以说 System Call 是比较消耗CPU的操作，原因在于发起 System Call 后 OS Kernel 会从用户态 Trap 到内核态，在切换过程中会发生寄存器组的切换、进程状态的转换等操作，这些操作都是相当消耗处理机资源的。

### I/O Multiplexing

I/O Multiplexing 就是本篇文章的重头戏——多路复用了。

![I/O Multiplexing](https://s2.loli.net/2024/02/02/Y68lvXiwF9V2MaJ.png)

在 Non-Blocing I/O 中，尽管处理机的资源有一部分可以被释放出来处理其他任务，但是 Application 仍然承担了轮询的压力；但是在 I/O Multiplexing 中轮询的操作通过`select`、`poll`和`epoll`三个 System Call 执行，并在合适的时机由 OS 调用回调函数处理。

多路复用允许进程同时监听并处理多个进程的状态，包括`readable`、`writeable`等。

#### select

```c
#include <sys/select.h>

//返回值：readfds、writefds、exceptfds 中事件就绪的fd的数量
int select(int nfds,                                    // 最大文件描述符fd+1
           fd_set *restrict readfds,                    // 等待读取的fds
           fd_set *restrict writefds,                   // 等待写入的fds
           fd_set *restrict exceptfds,                  // 异常fds
           struct timeval *restrict timeout);           // 超时时间
```

`select`函数会接受若干文件描述符，并返回准备就绪的数量。

1. 程序阻塞等待kernel返回。
2. kernel发现有fd就绪，返回数量。
3. 程序轮询3个fd_set寻找就绪的fd。
4. 发起真正的I/O操作（read、recvfrom等）。

`select`的优点有，但不多，例如：

1. 几乎所有的操作系统都支持`select`。
   > Windows 就没有`epoll`的支持。

#### poll

```c
#include <poll.h>

int poll(struct pollfd *fds,                        // 待监视的fd构成的struct pollfd数组
         nfds_t nfds,                               // 数组fds[]中元素数量
         int timeout);                              // 轮询时等待的最大超时时间

struct pollfd {
    int fd;                                         // 待监视的fd
    short events;                                   // 请求监视的事件
    short revents;                                  // 实际收到的事件
};
```

`poll`与`select`之间没有特别大的区别，相比于`select`，`poll`主要有这两个改进：

1. `select`的文件描述符集合是一个数组，而`poll`的文件描述符集合是一个结构体数组，这样可以避免`select`的文件描述符集合的大小限制。
2. `poll`的`revents`字段是一个输出参数，它会告诉我们哪些文件描述符就绪了。每次调用poll时不用像select一样每次都需要重新设置r、w、e文件描述符集，方便使用也减少数据向内核拷贝的开销。

#### epoll

`epoll`的函数定义：

```c
#include <sys/poll.h>

// 创建一个epfd，最多监视${size}个文件描述符
int epoll_create(int size);

int epoll_ctl(int epfd,                             // epfd
             int op,                                // 操作类型（注册、取消注册）
             int fd,                                // 待监视的fd
             struct epoll_event *event);            // 待监视的fd上的io事件

int epoll_wait(int epfd,                            // epfd
               struct epoll_event *events,          // 最终返回的就绪事件
               int maxevents,                       // 期望的就绪事件数量
               int timeout);                        // 超时时间

int epoll_wait(int epfd,                            // epfd
               struct epoll_event *events,          // 接收返回的就绪事件
               int maxevents,                       // 期望的就绪事件数量
               int timeout,                         // 超时时间
               const sigset_t *sigmask);            // 信号掩码

typedef union epoll_data {
    void *ptr;
    int fd;
    __uint32_t u32;
    __uint64_t u64;
} epoll_data_t;

struct epoll_event {
    __uint32_t events;                              // epoll events
    epoll_data_t data;                              // user data variable
};
```

`epoll`是Linux下的I/O多路复用机制，它是`select`和`poll`的增强版本，它的优势在于：

1. `epoll`没有最大并发连接的限制，它的性能随着系统中的文件描述符数量的增加而线性下降。
2. `epoll`使用“事件”的就绪通知方式，通过`epoll_ctl`注册fd，一旦fd就绪，内核会采用类似回调的方式来激活这个fd，这样就避免了`select`和`poll`每次调用都需要遍历整个fd集合的缺点。
3. `epoll`的`epoll_wait`函数会将就绪的fd放入到一个链表中，这样就避免了`select`和`poll`每次调用都需要重新设置fd集合的缺点。

在实际场景中，`epoll`毫无疑问是最佳选择。一方面，`poll`相比于`select`并没有太大的优化；另一方面，`epoll`相比于另外二者在处理集合、事件通知上都有很大的优势。不过性能提升的代价就是与前两者相比，`epoll`的API更加复杂。

首先，`epoll`支持更多的事件（`poll`和`select`只支持读、写、异常三种事件），`epoll`中可以关注的事件主要有：

- `EPOLLIN`，数据可读事件；
- `EPOLLOUT`，数据可写事件；
- `EPOLLRDHUP`，Socket 对端关闭连接或者关闭了写半连接；
- `EPOLLPRI`，紧急数据读取事件；
- `EPOLLERR`，错误事件；
- `EPOLLHUP`，挂起事件，`epoll`**总是会等待该事件**，不需要显示设置；
- `EPOLLET`，设置`epoll`以边缘触发模式工作（不指定该选项则使用级别触发Level Trigger模式）；
- `EPOLLONESHOT`，设置`epoll`针对某个`fd`上的事件只通知一次，一旦`epoll`通知了某个事件，该`fd`上后续到达的事件将不会再发送通知，除非重新通过`epoll_ctl EPOLL_CTL_MOD`更新其关注的事件。

以上是`epoll`能处理的更多种类的事件。除了更多的时间类型，`epoll`还支持两种事件模型：

- 水平触发（Level Trigger）：默认模式，`epoll`会一直等待`fd`上的事件就绪，直到`fd`上的事件被处理完毕。在这种模式下，当描述符从未就绪变为就绪时，内核通过`epoll`告诉进程该描述符有事件发生，之后如果进程一直不对这个就绪状态做出任何操作，则内核会继续通知，直到事件处理完成。以LT方式调用的`epoll`接口就相当于一个速度比较快的`poll`模型。
- 边缘触发（Edge Trigger）：`epoll`只会通知`fd`上的事件发生了变化，一旦`fd`上的事件被通知，`epoll`就不会再通知`fd`上的事件，直到`fd`上的事件发生了变化。在这种工作方式下，当描述符从未就绪变为就绪时，内核通过`epoll`告诉进程该描述符有事件发生，之后就算进程一直不对这个就绪状态做出任何操作，内核也不会再发送更多地通知，也就是说内核仅在该描述符事件到达的那个突变边缘对进程做出一次通知。
  > 根据ET方式的特性，epoll工作在此模式时必须使用**非阻塞文件描述符**，以避免由于一个文件描述符的阻塞读、阻塞写操作把处理多个文件描述符的任务“饿死”。

对于`selct`和`poll`，它们都是水平触发模式，而`epoll`可以支持水平触发和边缘触发模式。

### Signal Driven I/O

> To be continued...

### Asynchronous I/O

> To be continued...

## Redis 中的多路复用

本节应对十分经典的“单线程的 Redis 为啥这么快？”问题。这个问题的答案一般是两部分：纯内存操作、多路复用和单线程模型。

首先，对于Redis来讲，尽管经历了历代版本的多次修改（引入了多线程、异步IO等，参考下图），但是Redis的核心模型依然是单线程的。这个单线程的模型是Redis的核心优势，也是Redis能够如此快的原因之一。但是单线程的技术主要通过避免线程上下文的切换来提高性能，并不能解决I/O操作的问题。

![Redis里程碑版本特性](https://s2.loli.net/2024/02/03/9oLBH4mNlEFGp2I.png)

为了解决I/O性能瓶颈，Redis 首先引入的就是I/O多路复用技术，并在 6.0 版本中引入了多线程进一步优化Socket的处理效率。

![Redis客户端连接处理机制](https://s2.loli.net/2024/02/03/tLms3PvdKWQiahI.png)

再上图中可以看到，多个客户端的命令通过 Socket 与 Redis 通信并视作一个个时间。由于 Redis 的主线程采用单线程方案，所以各种操作都需要阻塞等待，这就意味着传输数据的IO阻塞会导致 Redis 无法处理其他客户端的请求。因此，各个 Socket 通过多路复用技术被一个（6.0 引入多线程 IO 后就是多个）线程处理，但不会由于网络传输/其他因素导致整个线程被阻塞，而是由主线程继续执行文件操作，直到有一个`fd`触发必要的事件再进行处理。

## 参考资料

- [Linux学习：I/O多路复用 - 牛客](https://www.nowcoder.com/discuss/477839665639313408?sourceSSR=search)
- [带你彻底理解Linux五种I/O模型 - Bigbyto](https://wiyi.org/linux-io-model.html#io-multiplexing)
- [Linux常见IO模型 - MySpace](https://www.hitzhangjie.pro/blog/2017-05-02-linux-common-io-model)
- [深入理解redis——Redis快的原因和IO多路复用深度解析 - Segmentful](https://segmentfault.com/a/1190000041488709)
- [Redis 和 I/O 多路复用 - 面向信仰编程](https://draveness.me/redis-io-multiplexing/)
- [一文搞懂 Redis 高性能之 IO 多路复用 - InfoQ](https://xie.infoq.cn/article/b3816e9fe3ac77684b4f29348)
