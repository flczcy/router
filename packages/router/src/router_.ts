import './g_'
import {
  createRouterError,
  ErrorTypes,
  NavigationFailure,
  NavigationRedirectError,
} from './errors'
import { START_LOCATION_NORMALIZED } from './location'
import { isRouteLocation, Lazy } from './types'

function guardToPromiseFn(
  guard: (to: any, from: any, next: any) => any,
  to: any,
  from: any,
  record?: any
): () => Promise<void> {
  return () =>
    new Promise((resolve, reject) => {
      // next 函数暴露给外部用户调用，传入不同参数 next(false), next(new Error()), next({name: 'foo'})
      const next = (valid: any) => {
        if (valid === false) {
          // prettier-ignore
          // next(false) 表示终止此次路由执行，直接 reject,中间的 then().then().then() 就都不执行了
          // guardToPromiseFn().then().then().then().catch() 直接调用 next(false)
          // 设置其 promise 为 reject，则立马执行 catch(), 中间多个 then 直接不执行
          reject(`ErrorTypes.NAVIGATION_ABORTED`)
        } else if (valid instanceof Error) {
          reject(valid)
        } else if (isRouteLocation(valid)) {
          // 传入的是一个对象，表示重定向到这个路由
          // prettier-ignore
          reject(`ErrorTypes.NAVIGATION_GUARD_REDIRECT`)
        } else {
          resolve()
        }
      }
      // 挂载对应路由的组件实例
      const instance = record && record.instances['']
      // 用户钩子函数返回值 guard(instance, to, from, next) - 注意这里有将这里定义的 next 函数暴露给
      // 外部用户的钩子函数，有外部用户进行调用
      const guardReturn = guard.call(instance, to, from, next)
      // 这里把用户钩子，beforeRouteEnter()，返回值包装成 promise, 这里统一了用户返回值，
      // 这样用户的钩子函数j也可以写出普通函数，也可以写成异步函数 async beforeRouteEnter(to, from, next) {...}
      // wrapping with Promise.resolve allows it to work with both async and sync guards
      let guardCall = Promise.resolve(guardReturn)
      if (guard.length < 3) {
        // 参数小于 3, 表示没有回调 next, 此时
        // guardReturn 返回 Promise 或者 常规值，这里会执行 then 中的 next 函数，
        // 在 next 函数中执行 resolve()
        guardCall = guardCall.then(next)
      }
      // 若是 guardCall 返回一个 reject 的 promise 上面包装的 guardReturn
      // 此时会立即执行这里的 catch 回调，从而执行 reject(err)
      guardCall.catch(err => reject(err))
    })
}

export function createRouter(options: any) {
  const currentRoute = {
    value: START_LOCATION_NORMALIZED,
  }

  let pendingLocation: any = START_LOCATION_NORMALIZED

  function resolve(to: object) {
    return { ...to }
  }

  function push(to: any) {
    if (typeof to === 'string') {
      to = { name: to }
    }
    return pushWithRedirect(to)
  }

  function pushWithRedirect(to: any) {
    const targetLocation: any = (pendingLocation = resolve(to))
    const from = currentRoute.value

    const toLocation = targetLocation
    return navigate(toLocation, from)
      .catch((error: any) => {
        console.error('navigate-error', error)
        return error
      })
      .then((failure: any) => {
        if (failure) {
          console.error('navigate-failure', failure)
          return Promise.reject(failure)
        } else {
          console.log('navigate-success', failure)
          return Promise.resolve(failure)
        }
      })
  }

  // prettier-ignore
  function checkCanceledNavigation( to: any, from: any ): any {
    if (pendingLocation !== to) {
      // prettier-ignore
      // return createRouterError<NavigationFailure>(ErrorTypes.NAVIGATION_CANCELLED, { from, to } )
      return 'ErrorTypes.NAVIGATION_CANCELLED'
    }
  }

  function checkCanceledNavigationAndReject(to: any, from: any): Promise<void> {
    const error = checkCanceledNavigation(to, from)
    console.log('checkCanceledNavigation', error, to)
    return error ? Promise.reject(error) : Promise.resolve()
  }

  function navigate(to: any, from: any): any {
    let guards: any = []
    // 传递两个参数内部自动调用 next()
    // prettier-ignore
    guards.push(guardToPromiseFn((to, from) => { console.log('beforeRouteLeave 0')}, to, from))
    // prettier-ignore
    guards.push(guardToPromiseFn((to, from, next) => {
      console.log('beforeRouteLeave 1')
      next()
    }, to, from))
    guards.push(
      guardToPromiseFn(
        (to, from, next) => {
          console.log('beforeRouteLeave 2')
          // next 函数没有调用，那么返回的 Promise 就一直得不到 resolve, 后面的 then() 回调函数得不到执行
          // next()
          // 这里调用 next(false) 表示 导航 abort
          // next(false)
          // 这里调用 next({}) 传递对象，表示导航 redirect
          // next({ name: 'c' })
          //
          // 模拟异步操作（例如权限检查或数据加载）
          setTimeout(() => {
            // 假设异步操作完成后继续导航
            next()
          }, 1000)
        },
        to,
        from
      )
    )
    guards.push(
      guardToPromiseFn(
        (to, from) => {
          console.log('beforeRouteLeave 3')
        },
        to,
        from
      )
    )

    // 是放在最后面
    // prettier-ignore
    const canceledNavigationCheck = checkCanceledNavigationAndReject.bind(null, to, from)
    guards.push(canceledNavigationCheck)

    // return runGuardQueue(guards)
    // 等价于：
    return (
      // return runGuardQueue(guards)
      Promise.resolve()
        // beforeRouteLeave guards
        .then(() => guards[0]())
        .then(() => guards[1]())
        .then(() => guards[2]())
        .then(() => guards[3]())
        .then(() => guards[4]())
        // runGuardQueue(guards)
        // check global guards beforeEach
        .then(() => {
          // check global guards beforeEach
          guards = []
          // 这里在钩子函数中 不调用 next(), 而是调用 push('/foo')
          // 而 push 又会调用 pushWithRedirect(...) 函数，里面会修改
          // pendingLocation = resolve('/foo') 的值
          guards.push(
            guardToPromiseFn(
              (to, from, next) => {
                console.log('pendingLocation', pendingLocation.name)
                // 钩子函数中直接调用 push 前往新的路由，此种情况属于 NAVIGATION_CANCELLED
                // 导航取消错误
                // push({name: 'a'}) // 这里会导致无限死循环
                // 需要判断 push('/foo') 执行完后，不在执行，
                if (pendingLocation.name === 'b') {
                  next()
                } else {
                  // push({ name: 'b' })
                  next()
                }
              },
              to,
              from
            )
          )
          guards.push(canceledNavigationCheck)
          return runGuardQueue(guards)
        })
        .then(() => {
          console.log('runGuardQueue done')
        })
    )
  }

  return {
    push,
  }
}

function runGuardQueue(guards: Lazy<any>[]): Promise<any> {
  return guards.reduce(
    (promise, guard) => promise.then(() => guard()),
    Promise.resolve()
  )
}

const router = createRouter({})

// # canceledNavigationCheck - NAVIGATION_CANCELLED 使用场景
// 同时同步的执行多个 push() 那么应该以最后一个准，这其中的错误信息为 NAVIGATION_CANCELLED
// 第一次点击 一次 push()
// router.push({ name: 'a' })

// pendingLocation = { name: 'a' }
// 然后第二次又执行一次 push(), 第一次的 push() 里面的钩子函数是异步的，还没有执行完
// 此时又执行新的 push
//
// router.push({ name: 'b' })

// 用户点击链接到 /page1
// router.push('/page1')
// pendingLocation = '/page1'

// 当还在处理到 /page1 的导航时...
// 用户快速点击链接到 /page2
// router.push('/page2')
// pendingLocation = '/page2'

// 当 /page1 的导航尝试完成时：
// if (pendingLocation !== '/page1') {
//   // 到 /page1 的导航被取消，因为现在要去 /page2
//   return createRouterError(ErrorTypes.NAVIGATION_CANCELLED)
// }

// 用户触发异步导航 - 比如里面有异步函数需要从 api load 数据，时间比较长
router.push('/page1').catch((failure: any) => {
  console.log('导航被更新的请求取消了')
  // if (isNavigationFailure(failure, NavigationFailureType.cancelled)) {
  //   console.log('导航被更新的请求取消了')
  // }
})

// 此时用户点击了另一个链接执行 新的 push 操作，则会将还在等待数据的老的 push 的路由给覆盖掉
// 总是以最新的 push() load 渲染组件

// router.push('/page2')

// 在导航完成前触发新导航
setTimeout(() => {
  router.push('/page2')
}, 100)
