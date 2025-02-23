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
          reject(createRouterError<NavigationFailure>( ErrorTypes.NAVIGATION_ABORTED, { from, to }))
        } else if (valid instanceof Error) {
          reject(valid)
        } else if (isRouteLocation(valid)) {
          // 传入的是一个对象，表示重定向到这个路由
          // prettier-ignore
          reject(createRouterError<NavigationRedirectError>( ErrorTypes.NAVIGATION_GUARD_REDIRECT, { from: to, to: valid }))
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
    pushWithRedirect(to)
  }

  function pushWithRedirect(to: any) {
    const targetLocation: any = (pendingLocation = resolve(to))
    const from = currentRoute.value

    const toLocation = targetLocation
    return navigate(toLocation, from)
      .catch((error: any) => {
        console.error('navigate', error)
      })
      .then((failure: any) => {
        console.error('navigate', failure)
      })
  }

  // prettier-ignore
  function checkCanceledNavigation( to: any, from: any ): NavigationFailure | void {
    if (pendingLocation !== to) {
      // prettier-ignore
      return createRouterError<NavigationFailure>(ErrorTypes.NAVIGATION_CANCELLED, { from, to } )
    }
  }

  function checkCanceledNavigationAndReject(to: any, from: any): Promise<void> {
    const error = checkCanceledNavigation(to, from)
    console.log('checkCanceledNavigation', error)
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
          next()
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
      Promise.resolve()
        // beforeRouteLeave guards
        .then(() => guards[0]())
        .then(() => guards[1]())
        .then(() => guards[2]())
        .then(() => guards[3]())
        .then(() => guards[4]())
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
                console.log(pendingLocation)
                // 钩子函数中直接调用 push 前往新的路由，此种情况属于 NAVIGATION_CANCELLED
                // 导航取消错误
                // push({name: 'a'}) // 这里会导致无限死循环
                // 需要判断 push('/foo') 执行完后，不在执行，
                if (pendingLocation.name === 'a') {
                  next()
                } else {
                  push({ name: 'b' })
                }
              },
              to,
              from
            )
          )
          guards.push(canceledNavigationCheck)
          return runGuardQueue(guards)
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
router.push({ name: 'a' })
