import { computed, ref } from 'vue'

export function useShopProductDetail() {
  const showDetailModal = ref(false)
  const selectedProduct = ref({})
  const exchangeSubmitting = ref(false)

  const canExchange = computed(() => {
    const { type, status, stock } = selectedProduct.value
    return !exchangeSubmitting.value && type === 'physical' && status === 'active' && Number(stock) > 0
  })

  const exchangeLabel = computed(() => {
    const { type, status, stock } = selectedProduct.value
    if (type !== 'physical') return '暂不支持兑换'
    if (status !== 'active') return '商品已下架'
    if (Number(stock) <= 0) return '库存不足'
    return '立即兑换'
  })

  function showProductDetail(product) {
    selectedProduct.value = product
    showDetailModal.value = true
  }

  function closeProductDetail() {
    showDetailModal.value = false
    selectedProduct.value = {}
  }

  function goToOrders() {
    uni.navigateTo({ url: '/pages-nonTheme/shop-orders' })
  }

  function exchangeProduct() {
    if (!canExchange.value) return
    exchangeSubmitting.value = true
    uni.navigateTo({
      url: `/pages-nonTheme/shop-confirm?productId=${encodeURIComponent(selectedProduct.value.id)}`,
      success: () => { showDetailModal.value = false },
      complete: () => { exchangeSubmitting.value = false }
    })
  }

  return {
    showDetailModal, selectedProduct, canExchange, exchangeLabel,
    showProductDetail, closeProductDetail, goToOrders, exchangeProduct
  }
}
